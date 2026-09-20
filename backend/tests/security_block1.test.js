const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth, actors, PASSWORD } = fixture;
vi.spyOn(require('../src/services/emailService'), 'sendEmail').mockResolvedValue(true);
const app = require('../src/app');
const login = id => fixture.login(app, id);
const gateway = '/api/pagamentos/gateway';
let provider, spies;
beforeAll(fixture.initialize);
beforeEach(async () => {
  await fixture.seed();
  await db.runAsync('DELETE FROM LogsAuditoria');
  provider = vi.fn().mockRejectedValue(new Error('Provider must not be called'));
  vi.stubGlobal('fetch', provider);
  spies = [];
});
afterEach(() => { spies.forEach(spy => spy.mockRestore()); vi.unstubAllEnvs(); });
afterAll(fixture.close);

it('unknown permissions, unsupported roles and master tenant bypasses are denied', () => {
  const { can } = require('../src/utils/permissions');
  for (const perfil of ['Administrador','Gerente','Recepcionista','Cliente','SuperAdmin','Admin','Atleta']) {
    expect(can({ perfil, tenant_id: 1 }, 'unregistered.action')).toBe(false);
    expect(can({ perfil, tenant_id: 1 }, '__proto__')).toBe(false);
  }
  expect(can({ perfil: 'SuperAdmin', tenant_id: 1 }, 'reservations.manage')).toBe(false);
  expect(can({ perfil: 'Administrador', tenant_id: null }, 'users.manage')).toBe(false);
});

it.each([
  [actors.admin, actors.admin, 'Gerente'], [actors.admin, actors.manager, 'Administrador'],
  [actors.admin, actors.receptionist, 'SuperAdmin'], [actors.manager, actors.manager, 'Administrador'],
  [actors.manager, actors.admin, 'Recepcionista'], [actors.manager, actors.receptionist, 'Gerente'],
  [actors.manager, actors.otherReceptionist, 'Recepcionista'], [actors.owner, actors.receptionist, 'Recepcionista'],
])('rejects management by %s of %s into %s without changing any user', async (actor, target, perfil) => {
  const session = await login(actor);
  const before = await db.allAsync('SELECT * FROM Usuarios ORDER BY id');
  const result = await auth(request(app).put('/api/usuarios/'+target), session).send({ nome:'Changed', email:'changed@example.test', senha:'Changed123!', perfil });
  expect([403,404]).toContain(result.status);
  expect(await db.allAsync('SELECT * FROM Usuarios ORDER BY id')).toEqual(before);
  expect(provider).not.toHaveBeenCalled();
});

it.each([[actors.admin,actors.manager,'Recepcionista'],[actors.admin,actors.receptionist,'Gerente'],[actors.manager,actors.receptionist,'Recepcionista']])('allows authorized team management by %s', async(actor,target,perfil)=>{
  const oldSession=await login(target), session=await login(actor);
  const result=await auth(request(app).put('/api/usuarios/'+target),session).send({nome:'Updated',email:'updated@example.test',perfil});
  expect(result.status).toBe(200);
  expect((await db.getAsync('SELECT perfil FROM Usuarios WHERE id=?',[target])).perfil).toBe(perfil);
  expect((await auth(request(app).get('/api/auth/me'),oldSession)).status).toBe(401);
});

it.each([actors.owner,actors.third,actors.master])('actor %s cannot use internal reads or manual/terminal payments',async actor=>{
  const session=await login(actor);
  for(const route of ['/api/quadras','/api/motivos','/api/clientes','/api/pagamentos/reservas','/api/reservas/grade']) {
    expect((await auth(request(app).get(route),session)).status,route).toBe(403);
  }
  for(const route of ['/api/pagamentos','/api/pagamentos/desconto','/api/pagamentos/estorno',gateway+'/cobranca']) {
    const result=await auth(request(app).post(route),session).send({reserva_id:1,metodo:'Maquineta',valor:100});
    expect(result.status,route).toBe(403);
  }
  expect((await db.getAsync('SELECT COUNT(*) AS n FROM Pagamentos')).n).toBe(0);
  expect((await db.getAsync('SELECT COUNT(*) AS n FROM PaymentIntents')).n).toBe(0);
  expect(provider).not.toHaveBeenCalled();
});

it('a publicly registered administrator is refused by every mounted master operation',async()=>{
  const body={nome:'New admin',email:'new-admin@example.test',senha:PASSWORD,perfil:'Administrador',arena_nome:'New arena'};
  expect((await request(app).post('/api/auth/register').send(body)).status).toBe(201);
  const response=await request(app).post('/api/auth/login').send({email:body.email,senha:PASSWORD});
  expect(response.status).toBe(200);
  const pairs=response.headers['set-cookie'].map(value=>value.split(';')[0]);
  const session={cookie:pairs.join('; '),csrf:pairs.find(value=>value.startsWith('cm_csrf=')).split('=')[1]};
  const routes=require('../src/routes/saasRoutes').stack.filter(layer=>layer.route && layer.route.path!=='/webhook-pagamento');
  expect(routes.length).toBeGreaterThan(20);
  for(const {route} of routes) for(const method of Object.keys(route.methods)) {
    const url='/api/saas'+route.path.replace(':id','1').replace(':key','mp_master_access_token');
    expect((await auth(request(app)[method](url),session).send({})).status,url).toBe(403);
  }
  expect(provider).not.toHaveBeenCalled();
});

it.each([{}, {senha_atual:'wrong'}, {senha_atual:PASSWORD,usuario_id:actors.otherManager}, {senha_atual:PASSWORD,usuario_id:actors.owner}])('refuses invalid ownership transfer %j',async body=>{
  const session=await login(actors.admin);
  const before=await db.allAsync('SELECT id,perfil FROM Usuarios ORDER BY id');
  const result=await auth(request(app).post('/api/usuarios/transferir-administracao'),session).send({usuario_id:actors.manager,...body});
  expect(result.status).toBe(403);
  expect(await db.allAsync('SELECT id,perfil FROM Usuarios ORDER BY id')).toEqual(before);
});

it('transfers administration atomically, audits IDs only and revokes both sessions',async()=>{
  const session=await login(actors.admin), targetSession=await login(actors.manager);
  const result=await auth(request(app).post('/api/usuarios/transferir-administracao'),session).send({usuario_id:actors.manager,senha_atual:PASSWORD});
  expect(result.status).toBe(200);
  expect(await db.allAsync('SELECT id,perfil FROM Usuarios WHERE id IN (1,6) ORDER BY id')).toEqual([{id:1,perfil:'Gerente'},{id:6,perfil:'Administrador'}]);
  for(const account of [session,targetSession]) expect((await auth(request(app).get('/api/auth/me'),account)).status).toBe(401);
  const audit=await db.allAsync("SELECT detalhes FROM LogsAuditoria WHERE evento='Transferência de administrador'");
  expect(audit).toHaveLength(1); expect(JSON.stringify(audit)).not.toContain(PASSWORD);
});

it('rolls back role changes when the mandatory audit fails',async()=>{
  const session=await login(actors.admin), original=db.runAsync.bind(db);
  spies.push(vi.spyOn(db,'runAsync').mockImplementation((sql,args)=>sql.includes('INSERT INTO LogsAuditoria(tenant_id') ? Promise.reject(new Error('audit unavailable')) : original(sql,args)));
  expect((await auth(request(app).post('/api/usuarios/transferir-administracao'),session).send({usuario_id:actors.manager,senha_atual:PASSWORD})).status).toBe(500);
  expect((await db.getAsync('SELECT perfil FROM Usuarios WHERE id=1')).perfil).toBe('Administrador');
  expect((await auth(request(app).get('/api/auth/me'),session)).status).toBe(200);
});

it('two concurrent transfers cannot promote two administrators',async()=>{
  const session=await login(actors.admin);
  const results=await Promise.all([actors.manager,actors.receptionist].map(usuario_id=>auth(request(app).post('/api/usuarios/transferir-administracao'),session).send({usuario_id,senha_atual:PASSWORD})));
  expect(results.filter(result=>result.status===200)).toHaveLength(1);
  expect(results.filter(result=>[401,403].includes(result.status))).toHaveLength(1);
  expect((await db.getAsync("SELECT COUNT(*) AS n FROM Usuarios WHERE tenant_id=1 AND perfil='Administrador'")).n).toBe(1);
});

it('a stale management request cannot edit an account promoted concurrently',async()=>{
  const actor=await db.getAsync('SELECT * FROM Usuarios WHERE id=1');
  await db.runAsync("UPDATE Usuarios SET perfil='Administrador' WHERE id=6");
  const write=vi.fn();
  await expect(require('../src/services/userManagementService').managedWrite(actor,6,'Recepcionista',write)).rejects.toMatchObject({status:403});
  expect(write).not.toHaveBeenCalled();
});

it('upgrading legacy memberships defaults to unverified and preserves every row',async()=>{
  const sqlite=require('sqlite3');
  const isolated=new sqlite.Database(':memory:');
  isolated.runAsync=(sql,args=[])=>new Promise((resolve,reject)=>isolated.run(sql,args,function(error){error?reject(error):resolve(this);}));
  isolated.allAsync=(sql,args=[])=>new Promise((resolve,reject)=>isolated.all(sql,args,(error,rows)=>error?reject(error):resolve(rows)));
  try {
    isolated.getAsync=(sql,args=[])=>new Promise((resolve,reject)=>isolated.get(sql,args,(error,row)=>error?reject(error):resolve(row)));
    require('../src/utils/transactions').installTransactions(isolated);
    await isolated.runAsync('CREATE TABLE Usuarios(id INTEGER,two_factor_secret TEXT,reset_password_token TEXT,reset_password_expires INTEGER)');
    await isolated.runAsync('CREATE TABLE ClientMemberships(usuario_id INTEGER,tenant_id INTEGER,cliente_id INTEGER)');
    await isolated.runAsync('INSERT INTO ClientMemberships VALUES(2,1,1)');
    await require('../src/config/securitySchema').ensureSecuritySchema(isolated);
    expect(await isolated.allAsync('SELECT * FROM ClientMemberships')).toEqual([{usuario_id:2,tenant_id:1,cliente_id:1,verified:0}]);
  } finally { await new Promise(resolve=>isolated.close(resolve)); }
});

it('does not link an existing client by email, phone, or legacy client_id',async()=>{
  await db.runAsync('DELETE FROM ClientMemberships WHERE usuario_id=2');
  await db.runAsync("UPDATE Usuarios SET email='owner@example.test' WHERE id=2");
  const user=await db.getAsync('SELECT * FROM Usuarios WHERE id=2');
  const member=await require('../src/services/clientAccessService').membership(user,1,true);
  expect(member.id).not.toBe(1);
  expect((await db.getAsync('SELECT cpf FROM Clientes WHERE id=?',[member.id])).cpf).toBeNull();
  await expect(require('../src/utils/gatewayAuthorization').assertReservationAccess(user,{tenant_id:1,cliente_id:1})).rejects.toMatchObject({status:403});
});

it('quarantines unproven legacy membership without deleting client or history',async()=>{
  await db.runAsync('UPDATE ClientMemberships SET verified=0 WHERE usuario_id=2');
  const user=await db.getAsync('SELECT * FROM Usuarios WHERE id=2');
  expect(await require('../src/services/clientAccessService').membership(user,1,false)).toBeUndefined();
  await expect(require('../src/services/clientAccessService').membership(user,1,true)).rejects.toMatchObject({status:403});
  expect(await db.getAsync('SELECT id FROM Clientes WHERE id=1')).toEqual({id:1});
  expect((await db.getAsync('SELECT COUNT(*) AS n FROM Reservas WHERE cliente_id=1')).n).toBe(2);
});

it('owner cancellation still works with a proven membership',async()=>{
  const session=await login(actors.owner);
  const response=await auth(request(app).post('/api/public/tenant/arena-a/cancelar-reserva/1'),session).send({});
  expect(response.status,JSON.stringify(response.body)).toBe(200);
  expect((await db.getAsync('SELECT status FROM Reservas WHERE id=1')).status).toBe('Cancelada');
});

it('account deletion cannot erase a client linked only by unverified legacy data',async()=>{
  const session=await login(actors.owner);
  await db.runAsync('UPDATE ClientMemberships SET verified=0 WHERE usuario_id=2');
  const before=await db.getAsync('SELECT * FROM Clientes WHERE id=1');
  const response=await auth(request(app).post('/api/public/tenant/arena-a/excluir-conta'),session).send({senha:PASSWORD});
  expect(response.status).toBe(200);
  expect(await db.getAsync('SELECT * FROM Clientes WHERE id=1')).toEqual(before);
  expect((await db.getAsync('SELECT ativo FROM Usuarios WHERE id=2')).ativo).toBe(0);
});

it('omitted, null and blank credentials preserve previous values; removal requires password and master MFA',async()=>{
  const session=await login(actors.master);
  const keys=['mp_master_access_token','mp_client_secret','mp_webhook_secret'];
  const before=await db.allAsync("SELECT chave,valor FROM ConfiguracoesSaaS WHERE chave LIKE 'mp_%' ORDER BY chave");
  for(const value of [undefined,null,'','   ']) {
    expect((await auth(request(app).put('/api/saas/configuracoes'),session).send(Object.fromEntries(keys.map(key=>[key,value])))).status).toBe(200);
  }
  expect(await db.allAsync("SELECT chave,valor FROM ConfiguracoesSaaS WHERE chave LIKE 'mp_%' ORDER BY chave")).toEqual(before);
  for(const proof of [{},{senha_atual:PASSWORD},{senha_atual:'wrong',codigo_2fa:fixture.totp()}]) {
    expect((await auth(request(app).delete('/api/saas/credenciais/mp_master_access_token'),session).send(proof)).status).toBe(403);
  }
  vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN','ENV-SECRET-MUST-NOT-RETURN');
  expect((await auth(request(app).delete('/api/saas/credenciais/mp_master_access_token'),session).send({senha_atual:PASSWORD,codigo_2fa:fixture.totp()})).status).toBe(200);
  expect(await require('../src/services/saasBillingService').getMasterAccessToken()).toBeNull();
  expect((await auth(request(app).get('/api/saas/configuracoes'),session)).body.has_mp_master_access_token).toBe(false);
});

it('tenant disconnect refuses missing/wrong password and managers, preserves token on rejection',async()=>{
  await db.runAsync("UPDATE Arenas SET gateway_access_token='ARENA-SECRET' WHERE id=1");
  const admin=await login(actors.admin),manager=await login(actors.manager);
  for(const [session,body] of [[admin,{}],[admin,{senha_atual:'wrong'}],[manager,{senha_atual:PASSWORD}]]) {
    expect((await auth(request(app).post(gateway+'/oauth/desconectar'),session).send(body)).status).toBe(403);
    expect((await db.getAsync('SELECT gateway_access_token AS token FROM Arenas WHERE id=1')).token).toBe('ARENA-SECRET');
  }
});

it('reads and database/provider failure logs never expose fixture secrets',async()=>{
  const secrets=['FIXTURE-MASTER-SECRET','FIXTURE-CLIENT-SECRET',fixture.WEBHOOK_SECRET,fixture.MFA_SECRET,'ARENA-SECRET','RECOVERY-SECRET'];
  await db.runAsync("UPDATE Arenas SET gateway_access_token='ARENA-SECRET' WHERE id=1");
  await require('../src/services/recoveryService').createChallenge(actors.admin, 'password', 'RECOVERY-SECRET');
  const admin=await login(actors.admin),master=await login(actors.master);
  const logs=['error','warn','log'].map(level=>vi.spyOn(console,level).mockImplementation(()=>{})); spies.push(...logs);
  const responses=[];
  for(const [session,routes] of [[admin,['/api/arenas/minha',gateway+'/maquineta','/api/usuarios','/api/auth/me']],[master,['/api/saas/configuracoes','/api/saas/arenas','/api/saas/arenas/1','/api/saas/usuarios','/api/saas/sessoes']]]) {
    for(const route of routes){const result=await auth(request(app).get(route),session);expect(result.status,route).toBe(200);responses.push(result.body);}
  }
  provider.mockResolvedValueOnce({ok:false,json:async()=>({message:secrets.join(' '),cause:[{description:secrets.join(' ')}]})});
  const declined=await auth(request(app).post(gateway+'/cobranca'),admin).send({reserva_id:1,metodo:'Pix'});
  expect(declined.status).toBeGreaterThanOrEqual(400); responses.push(declined.body);
  provider.mockRejectedValueOnce(new Error(secrets.join(' ')));
  const networkFailure=await auth(request(app).post(gateway+'/cobranca'),admin).send({reserva_id:1,metodo:'Pix'});
  expect(networkFailure.status).toBeGreaterThanOrEqual(400); responses.push(networkFailure.body);
  expect(provider).toHaveBeenCalledTimes(2);
  const original=db.allAsync.bind(db);
  spies.push(vi.spyOn(db,'allAsync').mockImplementation((sql,args)=>sql.includes('FROM ConfiguracoesSaaS') ? Promise.reject(new Error(secrets.join(' '))) : original(sql,args)));
  const databaseFailure=await auth(request(app).get('/api/saas/configuracoes'),master);
  expect(databaseFailure.status).toBe(500); responses.push(databaseFailure.body);
  expect(logs.flatMap(spy=>spy.mock.calls).length).toBeGreaterThan(0);
  const output=JSON.stringify({responses,logs:logs.flatMap(spy=>spy.mock.calls)});
  for(const secret of secrets) expect(output).not.toContain(secret);
});
