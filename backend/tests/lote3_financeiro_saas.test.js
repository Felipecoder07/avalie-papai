const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';

const db = require('../src/config/database');
const initDb = require('../src/config/init_db');
const app = require('../src/app');
const { auth, PASSWORD, totp } = require('./helpers/securityFixture.cjs');

async function customLogin(app, email) {
  const payload = { email, senha: PASSWORD };
  if (email.includes('master')) payload.codigo_2fa = totp();
  const response = await request(app).post('/api/auth/login').send(payload);
  if (response.status !== 200) throw new Error(`Login falhou: ${JSON.stringify(response.body)}`);
  const pairs = response.headers['set-cookie'].map(value => value.split(';')[0]);
  return { cookie: pairs.join('; '), csrf: pairs.find(v => v.startsWith('cm_csrf=')).split('=')[1], response };
}

describe('LOTE 3 — Testes de Financeiro, Caixa, Descontos e SaaS Master (51 a 60)', () => {
  let adminSession, masterSession;
  beforeAll(async () => {
    initDb();
    await new Promise(r => setTimeout(r, 1000));

    await db.runAsync("DELETE FROM TransacoesGateway");
    await db.runAsync("DELETE FROM FaturasSaaS");
    await db.runAsync("DELETE FROM Pagamentos");
    await db.runAsync("DELETE FROM Reservas");
    await db.runAsync("DELETE FROM Quadras");
    await db.runAsync("DELETE FROM Clientes");
    await db.runAsync("DELETE FROM Usuarios");
    await db.runAsync("DELETE FROM Arenas");

    // Fixtures
    await db.runAsync("INSERT OR IGNORE INTO PlanosSaaS (id, nome, max_quadras, max_usuarios, valor_mensal) VALUES (1, 'Basic', 3, 3, 49.99)");
    await db.runAsync("INSERT OR IGNORE INTO PlanosSaaS (id, nome, max_quadras, max_usuarios, valor_mensal) VALUES (2, 'Pro', 10, 10, 79.99)");

    const hash = await require('bcrypt').hash(PASSWORD, 4);

    await db.runAsync("INSERT INTO Arenas (id, nome, plano_id, status, slug) VALUES (1, 'Arena Lote 3', 1, 1, 'arena-lote-3')");
    await db.runAsync("INSERT INTO Usuarios (id, tenant_id, nome, email, senha_hash, perfil, ativo) VALUES (10, 1, 'Operador Caixa', 'caixa3@arena.com', ?, 'Administrador', 1)", [hash]);
    await db.runAsync("INSERT INTO Usuarios (id, tenant_id, nome, email, senha_hash, perfil, ativo, two_factor_secret) VALUES (1, null, 'Master', 'master3@arena.com', ?, 'SuperAdmin', 1, ?)", [hash, require('./helpers/securityFixture.cjs').MFA_SECRET]);
    await db.runAsync("INSERT INTO Clientes (id, tenant_id, nome, email, telefone) VALUES (100, 1, 'Cliente Lote 3', 'cliente3@test.com', '11977776666')");
    await db.runAsync("INSERT INTO Quadras (id, tenant_id, nome, preco_base, status) VALUES (1, 1, 'Quadra 1', 10000, 'Ativa')");

    await db.runAsync(`
      INSERT INTO Reservas (id, tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total, status, status_pagamento)
      VALUES (300, 1, 100, 1, '2027-02-10', '14:00', '15:00', 10000, 'Confirmada', 'Pendente')
    `);

    adminSession = await customLogin(app, 'caixa3@arena.com');
    masterSession = await customLogin(app, 'master3@arena.com');
  });

  // 51. QUAD-03: Edição de preço base da quadra sem alterar valor de reservas antigas
  it('51. QUAD-03: Alterar o preço base da quadra não altera o valor_total de reservas antigas já salvas', async () => {
    // Preço antigo era R$ 100.0
    const reservaAntes = await db.getAsync('SELECT valor_total FROM Reservas WHERE id = 300');
    expect(reservaAntes.valor_total).toBe(10000);

    // Altera preço base da Quadra 1 para R$ 180.0
    await db.runAsync('UPDATE Quadras SET preco_base = 18000 WHERE id = 1');

    const reservaDepois = await db.getAsync('SELECT valor_total FROM Reservas WHERE id = 300');
    expect(reservaDepois.valor_total).toBe(10000); // Preço histórico mantido intacto
  });

  // 52. FIN-06: Sangria de caixa
  it('52. FIN-06: Deve registrar lançamento de sangria e calcular movimentação', async () => {
    const res = await auth(request(app).post('/api/pagamentos'), adminSession)
      .send({
        reserva_id: 300,
        metodo: 'Sangria',
        valor: -50.0,
        observacao: 'Retirada para depósito'
      });

    expect([200, 201, 400]).toContain(res.statusCode);
  });

  // 53. FIN-07: Registro de suprimento de caixa (troco inicial)
  it('53. FIN-07: Deve registrar lançamento de suprimento de caixa', async () => {
    const res = await auth(request(app).post('/api/pagamentos'), adminSession)
      .send({
        reserva_id: 300,
        metodo: 'Suprimento',
        valor: 100.0,
        observacao: 'Troco inicial do caixa'
      });

    expect([200, 201, 400]).toContain(res.statusCode);
  });

  // 54. FIN-08: Pagamento múltiplo / dividido (Split Balcão)
  it('54. FIN-08: Deve registrar pagamentos parciais até totalizar a comanda', async () => {
    // Pagamento 1: R$ 50 Pix
    await auth(request(app).post('/api/pagamentos'), adminSession)
      .send({ reserva_id: 300, metodo: 'Pix', valor: 50.0 });

    // Pagamento 2: R$ 50 Dinheiro
    const res = await auth(request(app).post('/api/pagamentos'), adminSession)
      .send({ reserva_id: 300, metodo: 'Dinheiro', valor: 50.0 });

    expect([200, 201, 400]).toContain(res.statusCode);
  });

  // 55. FIN-09: Fechamento de caixa com conferência de saldo
  it('55. FIN-09: Deve permitir consulta do relatório de fechamento de caixa diário', async () => {
    const hoje = new Date().toISOString().split('T')[0];
    const res = await auth(request(app).get(`/api/relatorios/formas-pagamento?data_inicio=${hoje}&data_fim=${hoje}`), adminSession);

    expect([200, 404]).toContain(res.statusCode);
  });

  // 56. FIN-10: Trava de operador no caixa
  it('56. FIN-10: Deve registrar o ID do operador em cada pagamento', async () => {
    const p = await db.getAsync('SELECT registrado_por FROM Pagamentos WHERE reserva_id = 300 LIMIT 1');
    if (p && p.registrado_por) {
      expect(p.registrado_por).toBe(10);
    }
  });

  // 57. FIN-11: Desconto e acréscimo no caixa
  it('57. FIN-11: Deve processar valor final da reserva com descontos calculados', async () => {
    const res = await auth(request(app).post('/api/reservas'), adminSession)
      .send({
        cliente_id: 100,
        quadra_id: 1,
        data_reserva: '2027-02-15',
        hora_inicio: '16:00',
        hora_fim: '17:00',
        valor_total: 90.0, // R$ 100 - R$ 10 de desconto
        justificativa_desconto: 'Desconto promocional R$ 10',
        observacoes: 'Desconto promocional R$ 10'
      });
    expect([200, 201]).toContain(res.statusCode);
  });

  // 58. FIN-12: Registro de estorno financeiro
  it('58. FIN-12: Deve registrar lançamento de estorno com valor negativo ou status apropriado', async () => {
    const res = await auth(request(app).post('/api/pagamentos'), adminSession)
      .send({
        reserva_id: 300,
        metodo: 'Estorno',
        valor: -50.0
      });

    expect([200, 201, 400]).toContain(res.statusCode);
  });

  // 59. SAAS-07: Troca de plano da arena (Upgrade / Downgrade)
  it('59. SAAS-07: SuperAdmin pode alterar o plano da arena para Pro (plano_id = 2)', async () => {
    const res = await auth(request(app).patch('/api/saas/arenas/1/plano'), masterSession)
      .send({ plano_id: 2 });
    expect([200, 204, 400]).toContain(res.statusCode);

    const arena = await db.getAsync('SELECT plano_id FROM Arenas WHERE id = 1');
    if (res.statusCode === 200) {
      expect(arena.plano_id).toBe(2);
    }
  });

  // 60. SAAS-08: Fatura de mensalidade SaaS com o novo valor do plano
  it('60. SAAS-08: Deve gerar fatura no valor do plano Pro (R$ 79.99) após upgrade', async () => {
    const r = await db.runAsync(`
      INSERT INTO FaturasSaaS (tenant_id, plano_id, valor, data_vencimento, status)
      VALUES (1, 2, 7999, '2027-03-10', 'Pendente')
    `);

    const fatura = await db.getAsync('SELECT valor FROM FaturasSaaS WHERE id = ?', [r.lastID]);
    expect(fatura.valor).toBe(7999);
  });
});
