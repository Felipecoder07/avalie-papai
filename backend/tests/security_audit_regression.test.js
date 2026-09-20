const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth, actors } = fixture;
vi.spyOn(require('../src/services/emailService'), 'sendEmail').mockResolvedValue(true);
const app = require('../src/app');
const login = id => fixture.login(app, id);
const key = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const wrongKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
let certificates;
beforeAll(fixture.initialize);
beforeEach(async () => {
  await fixture.seed();
  vi.stubEnv('GOOGLE_CLIENT_ID', 'fixture-google-client');
  // Only Google's key transport is replaced. The library still verifies the
  // JWT signature, issuer, audience and timestamps with real RSA cryptography.
  certificates = vi.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({
    certs: { fixture: key.publicKey.export({ type: 'spki', format: 'pem' }) }, format: 'PEM',
  });
});
afterEach(() => { certificates.mockRestore(); vi.unstubAllEnvs(); });
afterAll(fixture.close);

function googleToken(changes = {}, signingKey = key.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ sub: 'fixture-google-subject', email: 'u2@example.test', email_verified: true,
    iss: 'https://accounts.google.com', aud: 'fixture-google-client', iat: now, exp: now + 3600, ...changes,
  }, signingKey, { algorithm: 'RS256', keyid: 'fixture' });
}
it.each(['signature', 'issuer', 'audience', 'expired', 'just expired', 'unverified email'])('audit 2: rejects Google token with invalid %s, without issuing a victim session', async problem => {
  const now = Math.floor(Date.now() / 1000);
  const changes = { issuer: { iss: 'https://attacker.invalid' }, audience: { aud: 'another-app' },
    expired: { iat: now - 10800, exp: now - 7200 }, 'just expired': {iat: now - 3600, exp: now - 1}, 'unverified email': { email_verified: false } };
  vi.stubEnv('NODE_ENV', 'production');
  const response = await request(app).post('/api/public/tenant/arena-a/google').send({
    credential: googleToken(changes[problem], problem === 'signature' ? wrongKey.privateKey : key.privateKey),
    senha: fixture.PASSWORD,
  });
  expect(response.status).toBe(401);
  expect(response.body).not.toHaveProperty('token');
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM AuthSessions')).toEqual({ count: 0 });
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM ExternalIdentities')).toEqual({ count: 0 });
  const profile = await request(app).get('/api/public/tenant/arena-a/meu-perfil').set('Authorization', 'Bearer ' + googleToken());
  expect(profile.status).toBe(401);
  expect(JSON.stringify(profile.body)).not.toContain('11111111111');
});
it('audit 2 positive control: valid signed identity links only after existing password proof', async () => {
  const credential = googleToken();
  const denied = await request(app).post('/api/public/tenant/arena-a/google').send({ credential });
  expect(denied.status).toBe(409);
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM AuthSessions')).toEqual({ count: 0 });
  const accepted = await request(app).post('/api/public/tenant/arena-a/google').send({ credential, senha: fixture.PASSWORD });
  expect(accepted.status).toBe(200);
  expect(accepted.body.usuario.id).toBe(actors.owner);
  expect(await db.getAsync('SELECT provider,subject,usuario_id FROM ExternalIdentities')).toEqual({ provider:'google',subject:'fixture-google-subject',usuario_id:actors.owner });
});
it('audit 4: client cannot create a free booking for a foreign client', async () => {
  const client = await login(actors.owner);
  const before = await db.allAsync('SELECT * FROM Reservas ORDER BY id');
  const response = await auth(request(app).post('/api/reservas'), client).send({cliente_id:3,quadra_id:1,data_reserva:'2099-12-21',hora_inicio:'10:00',hora_fim:'11:00',valor_total:0,pagamento:{registrar:true,valor:100,metodo:'Pix Online'}});
  expect(response.status).toBe(403);
  expect(await db.allAsync('SELECT * FROM Reservas ORDER BY id')).toEqual(before);
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM Pagamentos')).toEqual({count:0});
});
it('audit 5: anonymous or invalid-session phone lookup never reveals identity or history', async () => {
  for (const credential of [null, 'invalid-session']) {
    let req = request(app).get('/api/public/tenant/arena-a/minhas-reservas').query({telefone:'11900000001'});
    if (credential) req = req.set('Authorization','Bearer '+credential);
    const response = await req;
    expect(response.status).toBe(401);
    expect(response.headers['content-type']).toContain('application/json');
    expect(JSON.stringify(response.body)).not.toMatch(/owner@example|11111111111|11900000001/);
  }
  const owner = await login(actors.owner);
  const response = await auth(request(app).get('/api/public/tenant/arena-a/minhas-reservas'),owner);
  expect(response.status).toBe(200);
  expect(response.body.length).toBeGreaterThan(0);
  expect(response.body[0].cliente_cpf).toBe('11111111111');
});
it('audit 6: anonymous checkout preserves every field of the foreign customer', async () => {
  const before = await db.getAsync('SELECT * FROM Clientes WHERE id=3');
  const response = await request(app).post('/api/public/tenant/arena-a/agendar').send({nome:'Visitor',email:before.email,telefone:'11999999999',cpf:before.cpf,quadra_id:1,data_reserva:'2099-12-22',hora_inicio:'10:00',hora_fim:'11:00',valor_total:0});
  expect(response.status).toBe(201);
  expect(response.body.valor_total).toBe(100);
  expect(await db.getAsync('SELECT * FROM Clientes WHERE id=3')).toEqual(before);
  const booking = await db.getAsync('SELECT tenant_id,cliente_id,valor_total,status_pagamento FROM Reservas WHERE id=?',[response.body.reserva_id]);
  expect(booking).toMatchObject({tenant_id:1,valor_total:10000,status_pagamento:'Pendente'});
  expect(booking.cliente_id).not.toBe(3);
  const cookie = response.headers['set-cookie'].map(value => value.split(';')[0]).join('; ');
  const status = await request(app).get('/api/public/tenant/arena-a/status-reserva/'+response.body.reserva_id).set('Cookie',cookie);
  expect(status.status).toBe(200);
  const foreign = await request(app).get('/api/public/tenant/arena-b/status-reserva/3').set('Cookie',cookie);
  expect(foreign.status).toBe(404);
  expect(foreign.body).toEqual({error:'Reserva não encontrada.'});
});
it('audit 7: anonymous cancellation and Pix recovery cannot change a reservation', async () => {
  const before = await db.allAsync('SELECT * FROM Reservas ORDER BY id');
  const denied = await request(app).post('/api/public/tenant/arena-a/cancelar-pendente').send({reserva_id:1});
  expect(denied.status).toBe(404);
  expect(denied.body).toEqual({error:'Reserva não encontrada.'});
  const pix = await request(app).get('/api/public/tenant/arena-a/reserva-pix/1');
  expect(pix.status).toBe(404);
  expect(pix.body).toEqual({error:'Reserva não encontrada.'});
  expect(await db.allAsync('SELECT * FROM Reservas ORDER BY id')).toEqual(before);
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM TransacoesGateway')).toEqual({count:0});
  const owner = await login(actors.owner);
  const allowedPix = await auth(request(app).get('/api/public/tenant/arena-a/reserva-pix/1'),owner);
  expect(allowedPix.status).toBe(200);
  expect(allowedPix.body.copia_cola).toBeTypeOf('string');
  const allowedCancel = await auth(request(app).post('/api/public/tenant/arena-a/cancelar-pendente'),owner).send({reserva_id:1});
  expect(allowedCancel.status).toBe(200);
  expect((await db.getAsync('SELECT status FROM Reservas WHERE id=1')).status).toBe('Cancelada');
});
it('audit 11: same-day expired reset is rejected by HTTP; valid token works once and revokes the old session', async () => {
  const {createChallenge} = require('../src/services/recoveryService');
  const session = await login(actors.admin);
  const before = await db.getAsync('SELECT senha_hash FROM Usuarios WHERE id=1');
  const expired = await createChallenge(1,'password',undefined,-7200000);
  const response = await request(app).post('/api/auth/reset-password').send({token:expired,novaSenha:'ChangedSecure123!'});
  expect(response.status).toBe(400);
  expect(await db.getAsync('SELECT senha_hash FROM Usuarios WHERE id=1')).toEqual(before);
  const code = await createChallenge(1);
  const results = await Promise.all([1,2].map(()=>request(app).post('/api/auth/reset-password').send({token:code,novaSenha:'ChangedSecure123!'})));
  expect(results.map(r=>r.status).sort()).toEqual([200,400]);
  expect(await bcrypt.compare('ChangedSecure123!',(await db.getAsync('SELECT senha_hash FROM Usuarios WHERE id=1')).senha_hash)).toBe(true);
  expect((await auth(request(app).get('/api/auth/me'),session)).status).toBe(401);
});
it('audit 12: login and me responses do not leak cliente_id or password hash; status verifies slug against tenant', async () => {
  const adminSession = await login(actors.admin);
  const meRes = await auth(request(app).get('/api/auth/me'), adminSession);
  expect(meRes.status).toBe(200);
  expect(meRes.body.usuario).not.toHaveProperty('cliente_id');
  expect(meRes.body.usuario).not.toHaveProperty('senha_hash');

  const clientSession = await login(actors.owner);
  const clientMeRes = await auth(request(app).get('/api/auth/me'), clientSession);
  expect(clientMeRes.status).toBe(200);
  expect(clientMeRes.body.usuario).not.toHaveProperty('cliente_id');
  expect(clientMeRes.body.usuario).not.toHaveProperty('senha_hash');

  // getStatusReservaPublica cross-slug check
  const crossSlugRes = await auth(request(app).get('/api/public/tenant/arena-b/status-reserva/1'), clientSession);
  expect(crossSlugRes.status).toBe(404);
});

