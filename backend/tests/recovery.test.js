const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, actors } = fixture;
vi.spyOn(require('../src/services/emailService'), 'sendEmail').mockResolvedValue(true);
const app = require('../src/app');

beforeAll(fixture.initialize);
beforeEach(fixture.seed);
afterAll(fixture.close);

describe('Integration Tests — Recovery Flow (RecoveryChallenges)', () => {

  it('Deve responder sucesso genérico mesmo se o e-mail não estiver cadastrado', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'inexistente@test.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Se o e-mail estiver cadastrado, enviamos as instrucoes de recuperacao.');
  });

  it('Deve gerar desafio na tabela RecoveryChallenges quando o e-mail for válido', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'u1@example.test' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Se o e-mail estiver cadastrado, enviamos as instrucoes de recuperacao.');

    const challenge = await db.getAsync('SELECT * FROM RecoveryChallenges WHERE usuario_id=? AND purpose=? AND used=0', [actors.admin, 'password']);
    expect(challenge).not.toBeNull();
    expect(challenge.token_hash).toBeDefined();
    expect(challenge.expires).toBeGreaterThan(Date.now());
  });

  it('Deve impedir a redefinição se o token for incorreto ou expirado', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'token-errado', novaSenha: 'NovaSenha#123' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'Token invalido ou expirado.');
  });

  it('Deve redefinir a senha com sucesso quando o token for correto, invalidando sessoes e consumindo o token', async () => {
    const { createChallenge } = require('../src/services/recoveryService');
    const token = await createChallenge(actors.admin, 'password');

    // Make sure user has an active session
    const session = await fixture.login(app, actors.admin);
    expect((await fixture.auth(request(app).get('/api/auth/me'), session)).status).toBe(200);

    const res = await request(app).post('/api/auth/reset-password').send({ token, novaSenha: 'NovaSenhaSegura#123' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Senha redefinida. Faca login novamente.');

    // Token must be consumed
    const challengeAfter = await db.getAsync('SELECT used FROM RecoveryChallenges WHERE usuario_id=? AND purpose=?', [actors.admin, 'password']);
    expect(challengeAfter.used).toBe(1);

    // Old sessions must be revoked
    expect((await fixture.auth(request(app).get('/api/auth/me'), session)).status).toBe(401);

    // Can login with new password
    const login = await request(app).post('/api/auth/login').send({ email: 'u1@example.test', senha: 'NovaSenhaSegura#123' });
    expect(login.statusCode).toBe(200);
  });

});
