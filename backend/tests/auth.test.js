const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth } = fixture;
const app = require('../src/app');

describe('Testes de Integração de Segurança — Endpoint /me', () => {

  beforeAll(fixture.initialize);
  beforeEach(fixture.seed);
  afterAll(fixture.close);

  it('Deve retornar 200 e os dados detalhados do usuário quando o cookie for válido', async () => {
    const session = await fixture.login(app, 1);
    const res = await auth(request(app).get('/api/auth/me'), session);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('autenticado', true);
    expect(res.body).toHaveProperty('usuario');
    expect(res.body.usuario).toHaveProperty('nome', 'User1');
    expect(res.body.usuario).toHaveProperty('email', 'u1@example.test');
    expect(res.body.usuario).toHaveProperty('perfil', 'Administrador');
  });

  it('Deve retornar 401 (Não Autorizado) quando o token for inválido (sessão inexistente)', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', ['cm_session=invalid-session-id']);

    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('Deve retornar 401 (Não Autorizado) quando a requisição não enviar cabeçalho de autenticação', async () => {
    const res = await request(app)
      .get('/api/auth/me');

    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});
