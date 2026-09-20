const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth } = fixture;
const app = require('../src/app');

describe('Testes de Integração — Arquivamento de Clientes (Soft Delete)', () => {
  let clienteId;
  let session;

  beforeAll(fixture.initialize);
  beforeEach(async () => {
    await fixture.seed();
    session = await fixture.login(app, 1); // Admin da Arena 1
  });
  afterAll(fixture.close);

  test('1. Deve criar cliente novo (ativo = 1 por padrão)', async () => {
    const res = await auth(request(app).post('/api/clientes'), session)
      .send({
        nome: 'Carlos Arquivavel',
        telefone: '(11) 98888-7777',
        email: 'carlos.teste@email.com'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.ativo).toBe(1);
    clienteId = res.body.id;
  });

  test('2. Deve listar o novo cliente na busca padrão (?ativo=1)', async () => {
    const resPost = await auth(request(app).post('/api/clientes'), session).send({nome: 'Carlos Arquivavel', telefone: '(11) 98888-7777'});
    clienteId = resPost.body.id;

    const res = await auth(request(app).get('/api/clientes'), session);

    expect(res.status).toBe(200);
    const encontrado = res.body.find(c => c.id === clienteId);
    expect(encontrado).toBeDefined();
    expect(encontrado.nome).toBe('Carlos Arquivavel');
  });

  test('3. Deve arquivar o cliente com sucesso (PATCH /api/clientes/:id/arquivar)', async () => {
    const resPost = await auth(request(app).post('/api/clientes'), session).send({nome: 'Carlos Arquivavel', telefone: '(11) 98888-7777'});
    clienteId = resPost.body.id;

    const res = await auth(request(app).patch(`/api/clientes/${clienteId}/arquivar`), session);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('arquivado com sucesso');
  });

  test('4. Não deve mais retornar o cliente na lista principal de ativos', async () => {
    const resPost = await auth(request(app).post('/api/clientes'), session).send({nome: 'Carlos Arquivavel', telefone: '(11) 98888-7777'});
    clienteId = resPost.body.id;
    await auth(request(app).patch(`/api/clientes/${clienteId}/arquivar`), session);

    const res = await auth(request(app).get('/api/clientes'), session);

    expect(res.status).toBe(200);
    const encontrado = res.body.find(c => c.id === clienteId);
    expect(encontrado).toBeUndefined();
  });

  test('5. Deve retornar o cliente arquivado ao buscar com ?ativo=0', async () => {
    const resPost = await auth(request(app).post('/api/clientes'), session).send({nome: 'Carlos Arquivavel', telefone: '(11) 98888-7777'});
    clienteId = resPost.body.id;
    await auth(request(app).patch(`/api/clientes/${clienteId}/arquivar`), session);

    const res = await auth(request(app).get('/api/clientes?ativo=0'), session);

    expect(res.status).toBe(200);
    const encontrado = res.body.find(c => c.id === clienteId);
    expect(encontrado).toBeDefined();
    expect(encontrado.ativo).toBe(0);
  });

  test('6. Deve desarquivar/reativar o cliente (PATCH /api/clientes/:id/desarquivar)', async () => {
    const resPost = await auth(request(app).post('/api/clientes'), session).send({nome: 'Carlos Arquivavel', telefone: '(11) 98888-7777'});
    clienteId = resPost.body.id;
    await auth(request(app).patch(`/api/clientes/${clienteId}/arquivar`), session);

    const res = await auth(request(app).patch(`/api/clientes/${clienteId}/desarquivar`), session);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('reativado com sucesso');

    // Verifica se voltou para a lista de ativos
    const resList = await auth(request(app).get('/api/clientes'), session);

    expect(resList.status).toBe(200);
    const reativado = resList.body.find(c => c.id === clienteId);
    expect(reativado).toBeDefined();
  });
});
