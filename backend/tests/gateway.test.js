const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth, actors, signedWebhook } = fixture;
vi.spyOn(require('../src/services/emailService'),'sendEmail').mockResolvedValue(true);
const app = require('../src/app');
const base = '/api/pagamentos/gateway';
const login = id => fixture.login(app,id);
let provider;
beforeAll(fixture.initialize);
beforeEach(async () => {
  await fixture.seed();
  await db.runAsync("UPDATE Arenas SET gateway_access_token='FIXTURE-ARENA-TOKEN',gateway_device_id='device_test_123' WHERE id=1");
  provider = vi.fn().mockRejectedValue(new Error('Unexpected provider call'));
  vi.stubGlobal('fetch',provider);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(fixture.close);
function respond(body,ok=true) { provider.mockResolvedValueOnce({ok,json:async()=>body}); }
const pix = {id:991,point_of_interaction:{transaction_data:{qr_code_base64:'dGVzdA==',qr_code:'fixture-pix'}}};
async function charge(session,extra={}) {
  return auth(request(app).post(base+'/cobranca'),session).send({reserva_id:1,metodo:'Pix',...extra});
}
async function transaction(amount=100) {
  await db.runAsync("INSERT INTO TransacoesGateway(reserva_id,gateway_ref,metodo,valor,status) VALUES(1,'991','Pix',?,'Pendente')",[amount]);
}
async function unpaid() {
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM Pagamentos')).toEqual({count:0});
  expect((await db.getAsync('SELECT status_pagamento FROM Reservas WHERE id=1')).status_pagamento).toBe('Pendente');
}

it('creates Pix with the tenant credential and reuses the persisted intent',async()=>{
  const owner=await login(actors.owner);
  respond(pix);
  for(let i=0;i<2;i++) {
    const response=await charge(owner);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({gateway_ref:'991',copia_cola:'fixture-pix',qr_code:'data:image/png;base64,dGVzdA=='});
  }
  expect(provider).toHaveBeenCalledTimes(1);
  const [url,options]=provider.mock.calls[0];
  expect(url).toBe('https://api.mercadopago.com/v1/payments');
  expect(options.headers.Authorization).toBe('Bearer FIXTURE-ARENA-TOKEN');
  expect(JSON.parse(options.body)).toMatchObject({transaction_amount:100,payment_method_id:'pix'});
  expect((await db.getAsync('SELECT id FROM PaymentIntents')).id).toBe(options.headers['X-Idempotency-Key']);
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM TransacoesGateway')).toEqual({count:1});
  await unpaid();
});
it.each([['anonymous',null,401],['third client',actors.third,403],['other administrator',actors.otherAdmin,403],['master without tenant bypass',actors.master,403]])('denies charge and status for %s',async(_,id,status)=>{
  const session=id?await login(id):null;
  expect((await charge(session)).status).toBe(status);
  expect((await auth(request(app).get(base+'/status/1'),session)).status).toBe(status);
  expect(provider).not.toHaveBeenCalled();
  await unpaid();
});
it.each([actors.admin,actors.manager,actors.receptionist,actors.owner])('permits charge and status for supported actor %s',async id=>{
  const session=await login(id);
  respond(pix);
  expect((await charge(session)).status).toBe(200);
  const response=await auth(request(app).get(base+'/status/1'),session);
  expect(response.status).toBe(200);
  expect(response.body).toEqual({status:'Pendente',status_pagamento:'Pendente'});
});
it('provider rejection creates no financial credit',async()=>{
  const session=await login(actors.owner);
  respond({message:'Fixture rejection'},false);
  expect((await charge(session)).status).toBe(500);
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM TransacoesGateway')).toEqual({count:0});
  await unpaid();
});
it.each([actors.owner,actors.receptionist,actors.master])('denies gateway management to actor %s',async id=>{
  const session=await login(id);
  expect((await auth(request(app).get(base+'/maquineta'),session)).status).toBe(403);
  expect((await auth(request(app).post(base+'/maquineta'),session).send({gateway_access_token:'MALICIOUS'})).status).toBe(403);
  expect((await auth(request(app).post(base+'/oauth/desconectar'),session)).status).toBe(403);
  expect((await auth(request(app).get(base+'/oauth/url'),session)).status).toBe(403);
  expect((await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id=1')).gateway_access_token).toBe('FIXTURE-ARENA-TOKEN');
});
it('configuration and arena reads redact secrets and preserve omitted credentials',async()=>{
  const session=await login(actors.admin);
  for(const route of [base+'/maquineta','/api/arenas/minha']) {
    const response=await auth(request(app).get(route),session);
    expect(response.status).toBe(200);
    expect(response.body.gateway_connected).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('FIXTURE-ARENA-TOKEN');
    expect(response.body).not.toHaveProperty('gateway_access_token');
  }
  for(const value of [undefined,'','   ',null]) {
    const response=await auth(request(app).post(base+'/maquineta'),session).send({gateway_device_id:'device_test_456',gateway_access_token:value});
    expect(response.status).toBe(200);
    expect((await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id=1')).gateway_access_token).toBe('FIXTURE-ARENA-TOKEN');
  }
});
it('updates a credential and explicitly disconnects without returning it',async()=>{
  const session=await login(actors.admin);
  expect((await auth(request(app).post(base+'/maquineta'),session).send({gateway_access_token:'NEW-FIXTURE-TOKEN'})).status).toBe(200);
  expect((await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id=1')).gateway_access_token).toBe('NEW-FIXTURE-TOKEN');
  expect((await auth(request(app).post(base+'/oauth/desconectar'),session)).status).toBe(200);
  expect((await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id=1')).gateway_access_token).toBeNull();
});
it.each([actors.owner,actors.admin,actors.master])('production forbids simulation for actor %s',async id=>{
  const session=await login(id);
  await transaction();
  vi.stubEnv('NODE_ENV','production');
  expect((await auth(request(app).post(base+'/simular-pagamento'),session).send({gateway_ref:'991'})).status).toBe(403);
  await unpaid();
  expect(provider).not.toHaveBeenCalled();
});
it('five signed HTTP webhooks credit exactly once in production branches',async()=>{
  await transaction();
  vi.stubEnv('NODE_ENV','production');
  provider.mockImplementation(async()=>({ok:true,json:async()=>({id:991,status:'approved',transaction_amount:100})}));
  const responses=await Promise.all(Array.from({length:5},()=>signedWebhook(app,991)));
  expect(responses.map(r=>r.status)).toEqual([200,200,200,200,200]);
  expect(provider).toHaveBeenCalledTimes(5);
  expect(await db.getAsync('SELECT COUNT(*) AS count,SUM(valor) AS total FROM Pagamentos')).toEqual({count:1,total:100});
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM GatewayCredits')).toEqual({count:1});
  expect((await db.getAsync('SELECT status_pagamento FROM Reservas WHERE id=2')).status_pagamento).toBe('Pendente');
});
it.each(['invalid signature','expired signature','unsigned'])('rejects %s before calling the provider',async mode=>{
  await transaction();
  vi.stubEnv('NODE_ENV','production');
  const response=mode==='unsigned'
    ? await request(app).post(base+'/webhook').send({action:'payment.updated',data:{id:991}})
    : await signedWebhook(app,991,mode==='invalid signature'?{secret:'wrong-key'}:{timestamp:Date.now()-3600000});
  expect(response.status).toBe(403);
  expect(provider).not.toHaveBeenCalled();
  await unpaid();
});
it('HTTP charge and webhook for one currency unit do not settle another slot',async()=>{
  const session=await login(actors.owner);
  respond(pix);
  const response=await charge(session,{valor:1});
  expect(response.status).toBe(200);
  respond({id:991,status:'approved',transaction_amount:1});
  expect((await signedWebhook(app,991)).status).toBe(200);
  expect(await db.allAsync('SELECT status_pagamento FROM Reservas WHERE id IN (1,2) ORDER BY id')).toEqual([{status_pagamento:'Parcial'},{status_pagamento:'Pendente'}]);
  expect(await db.getAsync('SELECT COUNT(*) AS count,SUM(valor) AS total FROM Pagamentos')).toEqual({count:1,total:1});
});
it('pending provider payment produces no credit',async()=>{
  await transaction();
  respond({id:991,status:'pending',transaction_amount:100});
  expect((await signedWebhook(app,991)).status).toBe(200);
  expect(provider).toHaveBeenCalledTimes(1);
  await unpaid();
});
it('transient provider failure returns retry and later success credits once',async()=>{
  await transaction();
  provider.mockRejectedValueOnce(new Error('Fixture timeout'));
  expect((await signedWebhook(app,991)).status).toBe(503);
  await unpaid();
  respond({id:991,status:'approved',transaction_amount:100});
  expect((await signedWebhook(app,991)).status).toBe(200);
  expect(await db.getAsync('SELECT COUNT(*) AS count,SUM(valor) AS total FROM Pagamentos')).toEqual({count:1,total:100});
});
it('card approval uses the same ledger as repeated notification',async()=>{
  const owner=await login(actors.owner);
  respond({id:991,status:'approved'});
  expect((await charge(owner,{metodo:'Cartão',card_data:{token:'fixture-card',payment_method_id:'visa'}})).status).toBe(200);
  respond({id:991,status:'approved',transaction_amount:100});
  expect((await signedWebhook(app,991)).status).toBe(200);
  expect(await db.getAsync('SELECT COUNT(*) AS count,SUM(valor) AS total FROM Pagamentos')).toEqual({count:1,total:100});
});
it('terminal charge uses the configured device and stays pending',async()=>{
  const admin=await login(actors.admin);
  respond({id:991});
  expect((await charge(admin,{metodo:'Maquineta'})).status).toBe(200);
  expect(provider.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/devices/device_test_123/point-integration-api/payment-intents');
  await unpaid();
});
it.each([true,false])('refund is booked only after provider confirmation (%s)',async approved=>{
  await transaction();
  await require('../src/services/paymentLedgerService').settle('991',{valor_pago:100});
  respond(approved?{id:1,status:'approved',amount:100}:{message:'Fixture declined'},approved);
  const result=await require('../src/services/gatewayService').estornarPagamentoPix(1,1);
  expect(result.success).toBe(approved);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(await db.getAsync('SELECT SUM(valor) AS total FROM Pagamentos')).toEqual({total:approved?0:100});
  expect((await db.getAsync("SELECT status FROM TransacoesGateway WHERE gateway_ref='991'")).status).toBe(approved?'Estornado':'Pago');
});
it('static Pix remains available without a provider call',async()=>{
  await db.runAsync('UPDATE Arenas SET gateway_access_token=NULL WHERE id=1');
  const session=await login(actors.owner);
  const response=await charge(session);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({is_estatico:true,gateway_ref:'PIX_ESTATICO_1'});
  expect(provider).not.toHaveBeenCalled();
  await unpaid();
});
it('OAuth exchange binds arena and user, hides tokens and rejects replay',async()=>{
  const admin=await login(actors.admin), other=await login(actors.otherAdmin);
  await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS(chave,valor) VALUES('mp_client_id','FIXTURE-CLIENT')");
  const {createOAuthState}=require('../src/utils/oauthState');
  const state=await createOAuthState(1,actors.admin);
  expect((await auth(request(app).post(base+'/oauth/exchange'),other).send({state,code:'fixture-code'})).status).toBe(403);
  respond({access_token:'FIXTURE-OAUTH-TOKEN',public_key:'FIXTURE-PUBLIC'});
  const response=await auth(request(app).post(base+'/oauth/exchange'),admin).send({state,code:'fixture-code'});
  expect(response.status).toBe(200);
  expect(response.body.gateway_connected).toBe(true);
  expect(JSON.stringify(response.body)).not.toContain('FIXTURE-OAUTH-TOKEN');
  expect((await auth(request(app).post(base+'/oauth/exchange'),admin).send({state,code:'other-code'})).status).toBe(400);
  const nextState=await createOAuthState(1,actors.admin);
  expect((await auth(request(app).post(base+'/oauth/exchange'),admin).send({state:nextState,code:'fixture-code'})).status).toBe(400);
  expect(provider).toHaveBeenCalledTimes(1);
});
it('public OAuth callback accepts a valid state once',async()=>{
  await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS(chave,valor) VALUES('mp_client_id','FIXTURE-CLIENT')");
  const state=await require('../src/utils/oauthState').createOAuthState(1,actors.admin);
  respond({access_token:'FIXTURE-CALLBACK-TOKEN',public_key:'FIXTURE-PUBLIC'});
  const first=await request(app).get(base+'/oauth/callback').query({state,code:'callback-code'});
  expect(first.status).toBe(302);
  expect(first.headers.location).toContain('oauth=success');
  expect(first.headers.location).not.toContain('FIXTURE-CALLBACK-TOKEN');
  const replay=await request(app).get(base+'/oauth/callback').query({state,code:'new-code'});
  expect(replay.status).toBe(302);
  expect(replay.headers.location).toContain('oauth=error');
  expect(provider).toHaveBeenCalledTimes(1);
});
