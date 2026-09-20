const supertest = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');
const initDb = require('../src/config/init_db');

describe('Testes de Integração de Estresse — Conta Universal Multiarena (Modelo A)', () => {
  const slugArena1 = 'arena-alpha-test';
  const slugArena2 = 'arena-beta-test';
  let sessionGlobal = {};

  beforeAll(async () => {
    initDb();
    await new Promise(r => setTimeout(r, 600));

    // Limpa dados de testes anteriores
    await db.runAsync('DELETE FROM Reservas WHERE tenant_id IN (998, 999)');
    await db.runAsync('DELETE FROM Clientes WHERE tenant_id IN (998, 999)');
    await db.runAsync("DELETE FROM Usuarios WHERE email IN ('atleta.universal@teste.com', 'google.universal@teste.com')");
    await db.runAsync('DELETE FROM Quadras WHERE tenant_id IN (998, 999)');
    await db.runAsync('DELETE FROM Arenas WHERE id IN (998, 999)');

    // 1. Cria Arena 1
    await db.runAsync(`
      INSERT INTO Arenas (id, nome, slug, email, telefone, status, chave_pix, titular_pix)
      VALUES (998, 'Arena Alpha Test', '${slugArena1}', 'alpha@test.com', '11999990001', 1, '11999990001', 'Arena Alpha')
    `);

    // 2. Cria Arena 2
    await db.runAsync(`
      INSERT INTO Arenas (id, nome, slug, email, telefone, status, chave_pix, titular_pix)
      VALUES (999, 'Arena Beta Test', '${slugArena2}', 'beta@test.com', '11999990002', 1, '11999990002', 'Arena Beta')
    `);

    // 3. Cria Quadra na Arena 1 e na Arena 2
    await db.runAsync(`
      INSERT INTO Quadras (id, tenant_id, nome, tipo, preco_base, status)
      VALUES (9981, 998, 'Quadra Alpha 1', 'Areia', 10000, 'Ativa')
    `);

    await db.runAsync(`
      INSERT INTO Quadras (id, tenant_id, nome, tipo, preco_base, status)
      VALUES (9991, 999, 'Quadra Beta 1', 'Sintética', 12000, 'Ativa')
    `);
  });

  afterAll(async () => {
    // Limpeza final
    await db.runAsync('DELETE FROM Reservas WHERE tenant_id IN (998, 999)');
    await db.runAsync('DELETE FROM Clientes WHERE tenant_id IN (998, 999)');
    await db.runAsync("DELETE FROM Usuarios WHERE email IN ('atleta.universal@teste.com', 'google.universal@teste.com')");
    await db.runAsync('DELETE FROM Quadras WHERE tenant_id IN (998, 999)');
    await db.runAsync('DELETE FROM Arenas WHERE id IN (998, 999)');
  });

  it('1. Deve cadastrar atleta pela primeira vez na Arena Alpha (HTTP 201)', async () => {
    const res = await supertest(app)
      .post(`/api/public/tenant/${slugArena1}/cadastro`)
      .send({
        nome: 'Atleta Universal',
        email: 'atleta.universal@teste.com',
        senha: 'senhaSegura123',
        telefone: '11988887777'
      });

    expect(res.status).toBe(201);
    expect(res.body.usuario.email).toBe('atleta.universal@teste.com');

    const pairs = res.headers['set-cookie'].map(value => value.split(';')[0]);
    sessionGlobal = { cookie: pairs.join('; '), csrf: pairs.find(v => v.startsWith('cm_csrf=')).split('=')[1] };
  });

  it('2. Deve rejeitar tentativa de cadastro na Arena Beta com a senha INCORRETA (HTTP 400)', async () => {
    const res = await supertest(app)
      .post(`/api/public/tenant/${slugArena2}/cadastro`)
      .send({
        nome: 'Atleta Universal',
        email: 'atleta.universal@teste.com',
        senha: 'senhaERRADA999',
        telefone: '11988887777'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Não foi possível cadastrar');
  });

  it('3. Deve aceitar cadastro/login silencioso na Arena Beta com a senha CORRETA (HTTP 200)', async () => {
    const res = await supertest(app)
      .post(`/api/public/tenant/${slugArena2}/cadastro`)
      .send({
        nome: 'Atleta Universal',
        email: 'atleta.universal@teste.com',
        senha: 'senhaSegura123',
        telefone: '11988887777'
      });

    expect(res.status).toBe(200);
    expect(res.body.usuario.email).toBe('atleta.universal@teste.com');
  });

  it('4. Deve reutilizar o mesmo Token JWT da Arena Alpha para consultar perfil na Arena Beta', async () => {
    const res = await supertest(app)
      .get(`/api/public/tenant/${slugArena2}/meu-perfil`)
      .set('Cookie', sessionGlobal.cookie)
      .set('x-csrf-token', sessionGlobal.csrf);

    expect(res.status).toBe(200);
    expect(res.body.perfil.email).toBe('atleta.universal@teste.com');
    expect(res.body.perfil.nome).toBe('Atleta Universal');
  });

  it('5. Deve garantir isolamento total de reservas entre arenas', async () => {
    // 5a. Atleta faz reserva na Arena Alpha
    const resBookingAlpha = await supertest(app)
      .post(`/api/public/tenant/${slugArena1}/agendar`)
      .set('Cookie', sessionGlobal.cookie)
      .set('x-csrf-token', sessionGlobal.csrf)
      .send({
        nome: 'Atleta Universal',
        telefone: '11988887777',
        quadra_id: 9981,
        data_reserva: '2026-12-20',
        hora_inicio: '18:00',
        hora_fim: '19:00'
      });
    expect(resBookingAlpha.status).toBe(201);

    // 5b. Consulta "Minhas Reservas" na Arena Alpha -> DEVE conter 1 reserva
    const resReservesAlpha = await supertest(app)
      .get(`/api/public/tenant/${slugArena1}/minhas-reservas`)
      .set('Cookie', sessionGlobal.cookie)
      .set('x-csrf-token', sessionGlobal.csrf);

    expect(resReservesAlpha.status).toBe(200);
    expect(resReservesAlpha.body.length).toBeGreaterThanOrEqual(1);

    // 5c. Consulta "Minhas Reservas" na Arena Beta -> DEVE retornar 0 reservas (Isolamento garantido!)
    const resReservesBeta = await supertest(app)
      .get(`/api/public/tenant/${slugArena2}/minhas-reservas`)
      .set('Cookie', sessionGlobal.cookie)
      .set('x-csrf-token', sessionGlobal.csrf);

    expect(resReservesBeta.status).toBe(200);
    expect(resReservesBeta.body).toHaveLength(0);
  });

  it('6. Autenticação Google OAuth deve funcionar entre múltiplas arenas sem duplicar usuários', async () => {
    // Mock the google-auth-library since the system now strictly verifies credentials
    const { OAuth2Client } = require('google-auth-library');
    const originalVerify = OAuth2Client.prototype.verifyIdToken;
    OAuth2Client.prototype.verifyIdToken = async () => ({
      getPayload: () => ({ sub: '1234567890', email: 'google.universal@teste.com', email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600, name: 'Google Player' })
    });
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';

    // Login Google na Arena Alpha
    const resGoogleAlpha = await supertest(app)
      .post(`/api/public/tenant/${slugArena1}/google`)
      .send({
        credential: 'fake_valid_jwt_for_google',
        telefone: '11977776666'
      });

    expect(resGoogleAlpha.status).toBe(200);
    expect(resGoogleAlpha.body.usuario.email).toBe('google.universal@teste.com');

    // Login Google na Arena Beta com a mesma conta
    const resGoogleBeta = await supertest(app)
      .post(`/api/public/tenant/${slugArena2}/google`)
      .send({
        credential: 'fake_valid_jwt_for_google',
        telefone: '11977776666'
      });

    expect(resGoogleBeta.status).toBe(200);
    expect(resGoogleBeta.body.usuario.email).toBe('google.universal@teste.com');

    // Verifica que existe apenas 1 usuário cadastrado em Usuarios para esse email
    const usersCount = await db.allAsync(
      "SELECT id FROM Usuarios WHERE email = 'google.universal@teste.com'"
    );
    expect(usersCount).toHaveLength(1);

    OAuth2Client.prototype.verifyIdToken = originalVerify;
    delete process.env.GOOGLE_CLIENT_ID;
  });
});
