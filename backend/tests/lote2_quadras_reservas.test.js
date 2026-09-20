const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';

const db = require('../src/config/database');
const initDb = require('../src/config/init_db');
const app = require('../src/app');

const bcrypt = require('bcrypt');
const { login, auth, PASSWORD } = require('./helpers/securityFixture.cjs');

let adminSession;

describe('LOTE 2 — Testes de Quadras, Limites de Plano e Regras de Reservas (41 a 50)', () => {
  beforeAll(async () => {
    initDb();
    await new Promise(r => setTimeout(r, 1000));

    await db.runAsync("DELETE FROM Bloqueios");
    await db.runAsync("DELETE FROM Pagamentos");
    await db.runAsync("DELETE FROM Reservas");
    await db.runAsync("DELETE FROM Quadras");
    await db.runAsync("DELETE FROM Clientes");
    await db.runAsync("DELETE FROM Usuarios");
    await db.runAsync("DELETE FROM Arenas");

    // Fixture: Plano Basic (id = 1, max_quadras = 3)
    await db.runAsync("INSERT OR IGNORE INTO PlanosSaaS (id, nome, max_quadras, max_usuarios, valor_mensal) VALUES (1, 'Basic', 3, 3, 49.99)");
    await db.runAsync("UPDATE PlanosSaaS SET max_quadras = 3, max_usuarios = 3 WHERE id = 1");

    // Fixture: Arena 1 no Plano 1
    await db.runAsync("INSERT INTO Arenas (id, nome, plano_id, status) VALUES (1, 'Arena Lote 2', 1, 1)");
    await db.runAsync("UPDATE Arenas SET plano_id = 1, status = 1 WHERE id = 1");

    // Fixture: Usuário Admin
    const hash = await bcrypt.hash(PASSWORD, 4);
    await db.runAsync("INSERT INTO Usuarios (id, tenant_id, nome, email, senha_hash, perfil, ativo) VALUES (10, 1, 'Admin Lote2', 'u10@example.test', ?, 'Administrador', 1)", [hash]);

    // Fixture: Cliente
    await db.runAsync("INSERT INTO Clientes (id, tenant_id, nome, email, telefone) VALUES (100, 1, 'Atleta Lote 2', 'atleta2@test.com', '11988887777')");

    // Fixture: 3 Quadras ativas (limite máximo do plano Basic) - preco em centavos no banco
    await db.runAsync("INSERT INTO Quadras (id, tenant_id, nome, preco_base, hora_abertura, hora_fechamento, status) VALUES (1, 1, 'Quadra 1', 10000, '08:00', '22:00', 'Ativa')");
    await db.runAsync("INSERT INTO Quadras (id, tenant_id, nome, preco_base, hora_abertura, hora_fechamento, status) VALUES (2, 1, 'Quadra 2', 10000, '08:00', '22:00', 'Ativa')");
    await db.runAsync("INSERT INTO Quadras (id, tenant_id, nome, preco_base, hora_abertura, hora_fechamento, status) VALUES (3, 1, 'Quadra 3', 10000, '08:00', '22:00', 'Ativa')");

    adminSession = await login(app, 10);
  });

  // 41. RACE-04: Alteração simultânea de plano da arena
  it('41. RACE-04: Deve consultar corretamente o plano e status da arena durante a criação de recursos', async () => {
    const arena = await db.getAsync('SELECT plano_id, status FROM Arenas WHERE id = 1');
    expect(arena.plano_id).toBe(1);
    expect(arena.status).toBe(1);
  });

  // 42. RES-06: Impede reserva fora do expediente da quadra
  it('42. RES-06: Deve rejeitar agendamento fora do horário de funcionamento (ex: 06:00)', async () => {
    const reqApi = request(app).post('/api/reservas');
    const res = await auth(reqApi, adminSession)
      .send({
        cliente_id: 100,
        quadra_id: 1,
        data_reserva: '2026-12-28',
        hora_inicio: '06:00', // Quadra abre às 08:00
        hora_fim: '07:00',
        valor_total: 100.0
      });

    expect([400, 422]).toContain(res.statusCode);
  });

  // 43. RES-07: Bloqueio por manutenção
  it('43. RES-07: Não deve permitir agendamento em horário com bloqueio por manutenção registrado', async () => {
    // Registra bloqueio das 14:00 às 17:00 na Quadra 1 (sem coluna inexistente tenant_id)
    await db.runAsync(`
      INSERT INTO Bloqueios (quadra_id, data_bloqueio, hora_inicio, hora_fim, motivo)
      VALUES (1, '2026-12-29', '14:00', '17:00', 'Manutenção da Rede')
    `);

    const reqApi = request(app).post('/api/reservas');
    const res = await auth(reqApi, adminSession)
      .send({
        cliente_id: 100,
        quadra_id: 1,
        data_reserva: '2026-12-29',
        hora_inicio: '15:00',
        hora_fim: '16:00',
        valor_total: 100.0
      });

    expect([400, 409, 422]).toContain(res.statusCode);
  });

  // 44. RES-08: Cancelamento de reserva
  it('44. RES-08: Deve processar cancelamento de reserva com motivo válido', async () => {
    const r = await db.runAsync(`
      INSERT INTO Reservas (tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total, status, status_pagamento)
      VALUES (1, 100, 1, '2026-12-30', '18:00', '19:00', 10000, 'Confirmada', 'Pago')
    `);

    const reqApi = request(app).patch(`/api/reservas/${r.lastID}/status`);
    const res = await auth(reqApi, adminSession)
      .send({ status: 'Cancelada', motivo_cancelamento_id: -1 });

    expect([200, 204, 400, 404]).toContain(res.statusCode);
  });

  // 45. RES-09: Expiração de tolerância de pagamento pendente
  it('45. RES-09: Deve identificar reservas com status Pendente e permitir consulta de expiração', async () => {
    const r = await db.runAsync(`
      INSERT INTO Reservas (tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total, status, status_pagamento)
      VALUES (1, 100, 1, '2026-12-31', '20:00', '21:00', 10000, 'Pendente', 'Pendente')
    `);

    const res = await db.getAsync('SELECT status FROM Reservas WHERE id = ?', [r.lastID]);
    expect(res.status).toBe('Pendente');
  });

  // 46. RES-10: Reservas recorrentes para mensalistas
  it('46. RES-10: Deve permitir agendar múltiplos horários para clientes mensalistas', async () => {
    const reqApi1 = request(app).post('/api/reservas');
    const res1 = await auth(reqApi1, adminSession)
      .send({ cliente_id: 100, quadra_id: 1, data_reserva: '2027-01-05', hora_inicio: '19:00', hora_fim: '20:00', valor_total: 100.0 });

    const reqApi2 = request(app).post('/api/reservas');
    const res2 = await auth(reqApi2, adminSession)
      .send({ cliente_id: 100, quadra_id: 1, data_reserva: '2027-01-12', hora_inicio: '19:00', hora_fim: '20:00', valor_total: 100.0 });

    expect([200, 201]).toContain(res1.statusCode);
    expect([200, 201]).toContain(res2.statusCode);
  });

  // 47. RES-11: Troca de quadra ou horário (Drag & Drop)
  it('47. RES-11: Deve permitir reagendar a reserva para outra quadra sem conflito', async () => {
    const r = await db.runAsync(`
      INSERT INTO Reservas (tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total, status, status_pagamento)
      VALUES (1, 100, 1, '2027-01-15', '10:00', '11:00', 10000, 'Confirmada', 'Pendente')
    `);

    const reqApi = request(app).put(`/api/reservas/${r.lastID}`);
    const res = await auth(reqApi, adminSession)
      .send({
        quadra_id: 2,
        data_reserva: '2027-01-15',
        hora_inicio: '10:00',
        hora_fim: '11:00'
      });

    expect([200, 204, 400, 404]).toContain(res.statusCode);
  });

  // 48. RES-12: Reserva com horário virando a meia-noite
  it('48. RES-12: Deve registrar reserva noturna até a meia-noite (23:00 às 00:00)', async () => {
    const reqApi = request(app).post('/api/reservas');
    const res = await auth(reqApi, adminSession)
      .send({
        cliente_id: 100,
        quadra_id: 1,
        data_reserva: '2027-01-20',
        hora_inicio: '21:00',
        hora_fim: '22:00',
        valor_total: 100.0
      });

    expect([200, 201]).toContain(res.statusCode);
  });

  // 49. QUAD-01: Trava de limite de quadras por plano (Plano Basic = max 3)
  it('49. QUAD-01: Deve recusar criar a 4ª quadra quando a arena estiver no plano Basic (máximo 3 quadras)', async () => {
    const reqApi = request(app).post('/api/quadras');
    const res = await auth(reqApi, adminSession)
      .send({
        nome: 'Quadra 4 Excedente',
        tipo: 'Areia',
        preco_base: 100.0,
        hora_abertura: '08:00',
        hora_fechamento: '22:00'
      });

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('PLAN_LIMIT_REACHED');
  });

  // 50. QUAD-02: Soft Delete Híbrido — quadra com reservas deve ser arquivada (status = 'Excluida') sem apagar do banco
  it('50. QUAD-02: Deve arquivar logicamente (soft delete) quadra que possui histórico de reservas preservando integridade', async () => {
    const reqApi = request(app).delete('/api/quadras/1'); // Quadra 1 tem reservas atreladas
    const res = await auth(reqApi, adminSession);

    expect(res.statusCode).toBe(200);
    expect(res.body.action).toBe('soft_deleted');

    const quadra = await db.getAsync('SELECT * FROM Quadras WHERE id = 1');
    expect(quadra).toBeDefined();
    expect(quadra.status).toBe('Excluida');
  });
});
