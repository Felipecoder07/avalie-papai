const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, actors, auth } = fixture;
vi.spyOn(require('../src/services/emailService'), 'sendEmail').mockResolvedValue(true);
const app = require('../src/app');

beforeAll(fixture.initialize);
beforeEach(fixture.seed);
afterAll(fixture.close);

describe('Integration Tests — Welcome Flow and Secure Activation', () => {

  it('SaaS Master: Deve criar uma nova arena e gerar o token de ativação (boas-vindas)', async () => {
    const session = await fixture.login(app, actors.master);
    
    const res = await auth(request(app).post('/api/saas/arenas'), session)
      .send({
        nome: 'Arena Teste Ativacao',
        email: 'contato@arenateste.com',
        senha: 'senhaProvisoria123' // Is ignored by controller, random used instead
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message', 'Arena cadastrada com sucesso.');

    // Verifica no banco se o challenge de activation foi inserido para o novo administrador
    const user = await db.getAsync('SELECT id, activation_pending FROM Usuarios WHERE email = ?', ['contato@arenateste.com']);
    expect(user).toBeDefined();
    expect(user.activation_pending).toBe(1);

    const challenge = await db.getAsync('SELECT * FROM RecoveryChallenges WHERE usuario_id=? AND purpose=? AND used=0', [user.id, 'activation']);
    expect(challenge).not.toBeNull();
    expect(challenge.token_hash).toBeDefined();
  });

  it('Arena Admin: Deve criar um novo funcionário e gerar o token de ativação', async () => {
    const session = await fixture.login(app, actors.admin);

    const res = await auth(request(app).post('/api/usuarios'), session)
      .send({
        nome: 'Operador Novo',
        email: 'novo_operador@arena.com',
        senha: 'senhaDigitadaNoForm123', // ignored
        perfil: 'Recepcionista'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message', 'Usuário criado com sucesso e e-mail de ativação enviado.');

    // Verifica no banco se o token de ativação foi inserido para o funcionário
    const user = await db.getAsync('SELECT id, activation_pending FROM Usuarios WHERE email = ?', ['novo_operador@arena.com']);
    expect(user).toBeDefined();
    expect(user.activation_pending).toBe(1);

    const challenge = await db.getAsync('SELECT * FROM RecoveryChallenges WHERE usuario_id=? AND purpose=? AND used=0', [user.id, 'activation']);
    expect(challenge).not.toBeNull();
    expect(challenge.token_hash).toBeDefined();
  });

  it('Deve ativar a conta com sucesso consumindo o token', async () => {
    // Generate activation challenge for a new user
    await db.runAsync("INSERT INTO Usuarios (tenant_id, nome, email, senha_hash, perfil, ativo, activation_pending) VALUES (1, 'Pending', 'pending@arena.com', '...', 'Cliente', 1, 1)");
    const user = await db.getAsync("SELECT id FROM Usuarios WHERE email='pending@arena.com'");
    
    const { createChallenge } = require('../src/services/recoveryService');
    const token = await createChallenge(user.id, 'activation');

    const res = await request(app).post('/api/auth/reset-password').send({ token, novaSenha: 'NovaSenha#123', purpose: 'activation' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Senha redefinida. Faca login novamente.');

    // Verify user is activated
    const activatedUser = await db.getAsync('SELECT activation_pending FROM Usuarios WHERE id=?', [user.id]);
    expect(activatedUser.activation_pending).toBe(0);

    const challengeAfter = await db.getAsync('SELECT used FROM RecoveryChallenges WHERE usuario_id=? AND purpose=?', [user.id, 'activation']);
    expect(challengeAfter.used).toBe(1);
  });
});
