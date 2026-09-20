const request = require('supertest');
const bcrypt = require('bcrypt');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth, PASSWORD, actors } = fixture;
const email = vi.spyOn(require('../src/services/emailService'), 'sendEmail').mockResolvedValue(true);
const app = require('../src/app');
const login = id => fixture.login(app, id);
beforeAll(fixture.initialize);
beforeEach(fixture.seed);
afterAll(fixture.close);
afterEach(() => vi.unstubAllEnvs());

it.each([actors.admin, actors.manager, actors.receptionist, actors.owner])('changes own password for role %s and revokes every prior session', async id => {
  const session = await login(id), other = await login(id);
  const response = await auth(request(app).post('/api/auth/alterar-senha'), session).send({ senha_atual: PASSWORD, nova_senha: 'UpdatedPassword123!' });
  expect(response.status).toBe(200);
  expect(response.headers['set-cookie'].join(';')).toContain('HttpOnly');
  for (const old of [session, other]) expect((await auth(request(app).get('/api/auth/me'),old)).status).toBe(401);
  expect((await request(app).post('/api/auth/login').send({ email:`u${id}@example.test`,senha:'UpdatedPassword123!' })).status).toBe(200);
});
it('master requires current password and an individual second factor on every password route', async () => {
  const session = await login(actors.master);
  for (const route of ['/api/auth/alterar-senha','/api/saas/alterar-senha']) {
    expect((await auth(request(app).post(route),session).send({senha_atual:PASSWORD,nova_senha:'UpdatedPassword123!'})).status).toBe(403);
  }
  expect((await auth(request(app).put('/api/public/tenant/arena-a/meu-perfil'),session).send({senha_atual:PASSWORD,nova_senha:'UpdatedPassword123!'})).status).toBe(403);
  expect((await auth(request(app).post('/api/auth/alterar-senha'),session).send({senha_atual:PASSWORD,nova_senha:'UpdatedPassword123!',codigo_2fa:fixture.totp()})).status).toBe(200);
});
it('rejects wrong current password and overlong UTF-8 password without changing credentials', async () => {
  const session = await login();
  const before = await db.getAsync('SELECT senha_hash FROM Usuarios WHERE id=1');
  for (const body of [{senha_atual:'wrong',nova_senha:'UpdatedPassword123!'},{senha_atual:PASSWORD,nova_senha:'é'.repeat(37)}]) {
    expect((await auth(request(app).post('/api/auth/alterar-senha'),session).send(body)).status).toBeGreaterThanOrEqual(400);
  }
  expect(await db.getAsync('SELECT senha_hash FROM Usuarios WHERE id=1')).toEqual(before);
  expect((await auth(request(app).get('/api/auth/me'),session)).status).toBe(200);
});
it('does not accept a valid opaque session credential in a bearer header', async () => {
  const session = await login();
  const credential = /cm_session=([^;]+)/.exec(session.cookie)[1];
  expect((await request(app).get('/api/auth/me').set('Authorization','Bearer '+credential)).status).toBe(401);
});
it('invitations are opaque, single use and cannot authenticate or recover as an active account before activation', async () => {
  const session = await login();
  const response = await auth(request(app).post('/api/usuarios'), session).send({nome:'Invited User',email:'invite@example.test',perfil:'Recepcionista'});
  expect(response.status).toBe(201);
  const user = await db.getAsync('SELECT * FROM Usuarios WHERE id=?',[response.body.id]);
  expect(user.activation_pending).toBe(1);
  await db.runAsync('UPDATE Usuarios SET senha_hash=? WHERE id=?',[await bcrypt.hash(PASSWORD,4),user.id]);
  expect((await request(app).post('/api/auth/login').send({email:user.email,senha:PASSWORD})).status).toBe(403);
  // Delivery is queued by the controller; allow the fixture mail promise to run.
  await vi.waitFor(()=>expect(email.mock.calls.some(call=>call[0]===user.email)).toBe(true));
  const body = email.mock.calls.findLast(call=>call[0]===user.email)[2];
  const token = /token=([A-Za-z0-9_-]{43})/.exec(body)[1];
  expect(token).not.toContain('.');
  const attempts = await Promise.all([1,2].map(()=>request(app).post('/api/auth/reset-password').send({token,novaSenha:'ActivatedPassword123!'})));
  expect(attempts.map(r=>r.status).sort()).toEqual([200,400]);
  expect((await db.getAsync('SELECT activation_pending FROM Usuarios WHERE id=?',[user.id])).activation_pending).toBe(0);
  expect((await request(app).post('/api/auth/login').send({email:user.email,senha:'ActivatedPassword123!'})).status).toBe(200);
});
it.each([false,true])('migration removes default MFA (encrypted: %s), revokes sessions once, and requires enrollment', async encrypted => {
  vi.stubEnv('SECRETS_ENCRYPTION_KEY','ab'.repeat(32));
  const session = await login(actors.master);
  await db.runAsync('UPDATE Usuarios SET two_factor_secret=? WHERE id=5',[encrypted ? require('../src/utils/security').encrypt('JBSWY3DPEHPK3PXP') : 'JBSWY3DPEHPK3PXP']);
  await db.runAsync('DELETE FROM SecurityMigrations WHERE version=4');
  await require('../src/config/migrations/identityCutover').identityCutover(db);
  expect((await db.getAsync('SELECT two_factor_secret FROM Usuarios WHERE id=5')).two_factor_secret).toBeNull();
  expect((await auth(request(app).get('/api/auth/me'),session)).status).toBe(401);
  const next = await login(actors.master);
  expect(next.response.body.requires_mfa_setup).toBe(true);
  expect((await auth(request(app).get('/api/saas/configuracoes'),next)).status).toBe(403);
  await require('../src/config/migrations/identityCutover').identityCutover(db);
  expect((await auth(request(app).get('/api/auth/me'),next)).status).toBe(200);
});
it('unknown and known athlete recovery failures have the same response and execute password hashing', async () => {
  const spy = vi.spyOn(bcrypt,'hash');
  const results = [];
  for (const email of ['u2@example.test','absent@example.test']) results.push(await request(app).post('/api/public/tenant/arena-a/redefinir-senha').send({email,codigo:'000000',nova_senha:'UpdatedPassword123!'}));
  expect(results.map(r=>r.status)).toEqual([400,400]);
  expect(results[0].body).toEqual(results[1].body);
  expect(spy).toHaveBeenCalledTimes(2);
  spy.mockRestore();
});
