const request=require('supertest');
const bcrypt=require('bcrypt');
process.env.NODE_ENV='test';process.env.TEST_DB_PATH=':memory:';
const db=require('../src/config/database');
const email=require('../src/services/emailService');
vi.spyOn(email,'sendEmail').mockResolvedValue(true);
const app=require('../src/app');
const {ensureSecuritySchema}=require('../src/config/securitySchema');
const {settle,reverse}=require('../src/services/paymentLedgerService');
let cookies,csrf,passwordHash;
async function login(id=1){
 const result=await request(app).post('/api/auth/login').send({email:'u'+id+'@example.test',senha:'SecureTest123!'});
 expect(result.status).toBe(200);
 const pairs=result.headers['set-cookie'].map(v=>v.split(';')[0]);
 return {cookie:pairs.join('; '),csrf:pairs.find(v=>v.startsWith('cm_csrf=')).split('=')[1]};
}
const auth=(req,session)=>req.set('Cookie',session.cookie).set('x-csrf-token',session.csrf);
beforeAll(async()=>{
 require('../src/config/init_db')();await new Promise(r=>setTimeout(r,500));await ensureSecuritySchema(db);
 passwordHash=await bcrypt.hash('SecureTest123!',4);
});
beforeEach(async()=>{
 for(const table of ['PaymentAllocations','GatewayCredits','RefundIntents','SecurityOutbox','PaymentIntents','AuthSessions','RecoveryChallenges','ExternalIdentities','ClientMemberships','GuestAccess','TransacoesGateway','Pagamentos','Reservas','Quadras','Clientes','Usuarios','Arenas']) await db.runAsync('DELETE FROM '+table);
 await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS(chave,valor) VALUES('manutencao_ativa','0')");
 await db.runAsync("INSERT INTO Arenas(id,nome,slug,status,chave_pix) VALUES(1,'Arena A','arena-a',1,'pix@example.test'),(2,'Arena B','arena-b',1,NULL)");
 await db.runAsync("INSERT INTO Clientes(id,tenant_id,nome,email,cpf) VALUES(1,1,'Owner','owner@example.test','11111111111'),(2,1,'Third','third@example.test','22222222222'),(3,2,'Foreign','foreign@example.test','33333333333')");
 for(const [id,role,tenant,client] of [[1,'Administrador',1,null],[2,'Cliente',1,1],[3,'Cliente',1,2],[4,'Administrador',2,null],[5,'SuperAdmin',null,null],[6,'Gerente',1,null],[7,'Recepcionista',1,null]]) await db.runAsync('INSERT INTO Usuarios(id,tenant_id,cliente_id,nome,email,perfil,senha_hash,ativo) VALUES(?,?,?,?,?,?,?,1)',[id,tenant,client,'User'+id,'u'+id+'@example.test',role,passwordHash]);
 await db.runAsync("INSERT INTO Quadras(id,tenant_id,nome,preco_base,status) VALUES(1,1,'Court',100,'Ativa')");
 await db.runAsync("INSERT INTO Reservas(id,tenant_id,cliente_id,quadra_id,data_reserva,hora_inicio,hora_fim,valor_total,status,status_pagamento,grupo_id) VALUES(1,1,1,1,'2099-12-01','10:00','11:00',100,'Pendente','Pendente','group1'),(2,1,1,1,'2099-12-01','11:00','12:00',100,'Pendente','Pendente','group1')");
});
afterAll(()=>new Promise(resolve=>db.close(resolve)));
it('real login issues HttpOnly cookie; CSRF and logout revoke access',async()=>{
 const session=await login();
 expect((await auth(request(app).get('/api/clientes'),session)).status).toBe(200);
 expect((await request(app).post('/api/auth/logout').set('Cookie',session.cookie)).status).toBe(403);
 expect((await auth(request(app).post('/api/auth/logout'),session)).status).toBe(200);
 expect((await auth(request(app).get('/api/clientes'),session)).status).toBe(401);
});
it('inactive account and changed role revoke sessions immediately',async()=>{
 const session=await login();await db.runAsync('UPDATE Usuarios SET ativo=0 WHERE id=1');
 expect((await auth(request(app).get('/api/clientes'),session)).status).toBe(401);
 await db.runAsync("UPDATE Usuarios SET ativo=1,perfil='Recepcionista' WHERE id=1");
 expect((await auth(request(app).get('/api/clientes'),session)).status).toBe(401);
});
it('tenant administrator cannot promote self or create master',async()=>{
 const session=await login();
 expect((await auth(request(app).put('/api/usuarios/1'),session).send({nome:'User',email:'u1@example.test',perfil:'SuperAdmin'})).status).toBe(403);
 expect((await auth(request(app).post('/api/usuarios'),session).send({nome:'User',email:'new@example.test',perfil:'SuperAdmin'})).status).toBe(403);
 expect((await auth(request(app).get('/api/saas/configuracoes'),session)).status).toBe(403);
 expect((await db.getAsync('SELECT perfil FROM Usuarios WHERE id=1')).perfil).toBe('Administrador');
});
it('client cannot access staff finances or forge manual payment',async()=>{
 const session=await login(2);
 for(const route of ['/api/clientes','/api/pagamentos/reservas','/api/pagamentos/resumo','/api/reservas/grade?data=2099-12-01']) expect((await auth(request(app).get(route),session)).status).toBe(403);
 expect((await auth(request(app).post('/api/pagamentos'),session).send({reserva_id:1,valor:100,metodo:'Pix Online'})).status).toBe(403);
 expect((await db.getAsync('SELECT COUNT(*) AS n FROM Pagamentos')).n).toBe(0);
});
it('anonymous history, wrong owner and wrong slug do not expose reservations',async()=>{
 expect((await request(app).get('/api/public/tenant/arena-a/minhas-reservas?telefone=111')).status).toBe(401);
 expect((await request(app).get('/api/public/status-reserva/1')).status).toBe(404);
 const other=await login(3);
 expect((await auth(request(app).get('/api/public/tenant/arena-a/status-reserva/1'),other)).status).toBe(404);
 const owner=await login(2);
 expect((await auth(request(app).get('/api/public/tenant/arena-b/status-reserva/1'),owner)).status).toBe(404);
 expect((await auth(request(app).get('/api/public/tenant/arena-a/status-reserva/1'),owner)).status).toBe(200);
});
it('unsigned Google identity and legacy JWT are rejected',async()=>{
 expect((await request(app).post('/api/public/tenant/arena-a/google').send({email:'u2@example.test',nome:'Forged'})).status).toBe(400);
 const jwt=require('jsonwebtoken').sign({id:1,perfil:'SuperAdmin'},'secret-jwt-courtmanager-2026');
 expect((await request(app).get('/api/saas/configuracoes').set('Authorization','Bearer '+jwt)).status).toBe(401);
});
it('five concurrent settlements credit exactly once and allocate by balance',async()=>{
 await db.runAsync("INSERT INTO TransacoesGateway(reserva_id,gateway_ref,metodo,valor,status) VALUES(1,'991','Pix',100,'Pendente')");
 await Promise.all(Array.from({length:5},()=>settle('991',{valor_pago:100})));
 expect(await db.getAsync('SELECT COUNT(*) AS n,SUM(valor) AS total FROM Pagamentos')).toEqual({n:1,total:100});
 expect((await db.getAsync('SELECT status_pagamento FROM Reservas WHERE id=2')).status_pagamento).toBe('Pendente');
});
it('one real paid currency unit never settles another slot',async()=>{
 await db.runAsync("INSERT INTO TransacoesGateway(reserva_id,gateway_ref,metodo,valor,status) VALUES(1,'992','Pix',1,'Pendente')");await settle('992',{valor_pago:1});
 expect((await db.getAsync('SELECT status_pagamento FROM Reservas WHERE id=1')).status_pagamento).toBe('Parcial');
 expect((await db.getAsync('SELECT status_pagamento FROM Reservas WHERE id=2')).status_pagamento).toBe('Pendente');
 await reverse('992',1);await reverse('992',1);
 expect((await db.getAsync('SELECT SUM(valor) AS total FROM Pagamentos')).total).toBe(0);
});
it('manual concurrent payments cannot exceed balance; online methods rejected',async()=>{
 const session=await login();
 const responses=await Promise.all(Array.from({length:5},()=>auth(request(app).post('/api/pagamentos'),session).send({reserva_id:1,valor:100,metodo:'Dinheiro'})));
 expect(responses.filter(r=>r.status===201)).toHaveLength(1);
 expect((await auth(request(app).post('/api/pagamentos'),session).send({reserva_id:2,valor:100,metodo:'Pix Online'})).status).toBe(400);
 expect((await db.getAsync('SELECT SUM(valor) AS total FROM Pagamentos')).total).toBe(100);
});
it('expired challenge fails and concurrent reset succeeds once',async()=>{
 const {createChallenge,resetWithChallenge}=require('../src/services/recoveryService');
 const old=await createChallenge(1,'password',undefined,-1000);
 await expect(resetWithChallenge(1,'password',old,'ChangedSecure123!')).rejects.toMatchObject({status:400});
 const code=await createChallenge(1);
 const results=await Promise.allSettled([resetWithChallenge(1,'password',code,'ChangedSecure123!'),resetWithChallenge(1,'password',code,'ChangedSecure456!')]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
});
it('upload rejects active HTML even with a declared image type',async()=>{
 const session=await login();const image='data:image/html;base64,'+Buffer.from('<script>alert(1)</script>').toString('base64');
 expect((await auth(request(app).post('/api/arenas/upload-capa'),session).send({image})).status).toBe(400);
});
it('staff booking checks client tenant and simultaneous availability',async()=>{
 const session=await login();const body={cliente_id:3,quadra_id:1,data_reserva:'2099-12-02',hora_inicio:'10:00',hora_fim:'11:00'};
 expect((await auth(request(app).post('/api/reservas'),session).send(body)).status).toBe(404);
 const responses=await Promise.all([1,2].map(()=>auth(request(app).post('/api/reservas'),session).send({...body,cliente_id:1})));
 expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
});
