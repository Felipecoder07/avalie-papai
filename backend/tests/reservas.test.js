const request = require('supertest');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// Configura o ambiente como teste ANTES de carregar o banco e app
process.env.NODE_ENV = 'test';
const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';


const db = require('../src/config/database');
const initDb = require('../src/config/init_db');
const app = require('../src/app');

// Gera token de teste válido com tenant_id = 1 (Arena 1)
const testToken = jwt.sign({
  id: 1,
  tenant_id: 1,
  perfil: 'Administrador'
}, JWT_SECRET, { expiresIn: '1h' });

describe('Testes de Integração de Reservas e Validação de Conflito de Horário (RN-001)', () => {

  beforeAll(async () => {
    // Inicializa o esquema de tabelas e sementes
    initDb();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Garante limpeza prévia de tenant 1 para isolamento dos testes
    await db.runAsync("DELETE FROM Reservas WHERE tenant_id = 1");
    await db.runAsync("DELETE FROM Quadras WHERE tenant_id = 1");
    await db.runAsync("DELETE FROM Clientes WHERE tenant_id = 1");
    await db.runAsync("DELETE FROM Arenas WHERE id = 1");

    // Insere dados de teste específicos (Arena, Quadras e Cliente)
    await db.runAsync("INSERT INTO Arenas (id, nome, status) VALUES (1, 'Arena Teste', 1)");
    await db.runAsync("INSERT INTO Clientes (id, tenant_id, nome, telefone) VALUES (1, 1, 'Cliente Teste', '11999999999')");
    await db.runAsync("INSERT INTO Quadras (id, tenant_id, nome, tipo, preco_base, hora_abertura, hora_fechamento, status, modalidades) VALUES (1, 1, 'Quadra 1 Areia', 'Areia', 100, '08:00', '22:00', 'Ativa', '[]')");
    await db.runAsync("INSERT INTO Quadras (id, tenant_id, nome, tipo, preco_base, hora_abertura, hora_fechamento, status, modalidades) VALUES (2, 1, 'Quadra 2 Padel', 'Saibro', 120, '08:00', '22:00', 'Ativa', '[]')");
  });

  afterAll(async () => {
    try {
      await db.runAsync("DELETE FROM Reservas WHERE tenant_id = 1");
      await db.runAsync("DELETE FROM Quadras WHERE tenant_id = 1");
      await db.runAsync("DELETE FROM Clientes WHERE tenant_id = 1");
      await db.runAsync("DELETE FROM Arenas WHERE id = 1");
    } catch {
      // Ignora erro de limpeza
    }
  });

  it('Deve criar uma reserva com sucesso na Quadra 1 se não houver conflito', async () => {
    const res = await request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-14', // data futura válida
        hora_inicio: '19:00',
        hora_fim: '20:30'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message', 'Reserva criada com sucesso.');
    expect(res.body).toHaveProperty('valor_total', 150); // 1.5 horas * 100/hora = 150
    expect(res.body).toHaveProperty('reserva_id');
  });

  it('Deve impedir a criação de reserva (409) se houver sobreposição exata de horários', async () => {
    const res = await request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-14',
        hora_inicio: '19:00',
        hora_fim: '20:30'
      });

    expect(res.statusCode).toBe(409);
    expect(res.body).toHaveProperty('error', 'A quadra já possui uma reserva neste horário.');
  });

  it('Deve impedir a criação de reserva (409) se houver sobreposição parcial (dentro do intervalo)', async () => {
    const res = await request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-14',
        hora_inicio: '19:30',
        hora_fim: '20:00'
      });

    expect(res.statusCode).toBe(409);
    expect(res.body).toHaveProperty('error', 'A quadra já possui uma reserva neste horário.');
  });

  it('Deve criar a reserva com sucesso se o horário iniciar exatamente quando a outra termina (boundary check)', async () => {
    const res = await request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-14',
        hora_inicio: '20:30',
        hora_fim: '21:30'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message', 'Reserva criada com sucesso.');
  });

  it('Deve criar a reserva com sucesso se for no mesmo horário, mas em outra quadra', async () => {
    const res = await request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        cliente_id: 1,
        quadra_id: 2, // Quadra 2 está livre nesse horário
        data_reserva: '2026-12-14',
        hora_inicio: '19:00',
        hora_fim: '20:30'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message', 'Reserva criada com sucesso.');
    expect(res.body).toHaveProperty('valor_total', 180); // 1.5 horas * 120/hora = 180
    expect(res.body).toHaveProperty('reserva_id');
  });

  it('Deve impedir a criação de reserva (400) se o horário estiver fora de expediente', async () => {
    const res = await request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-14',
        hora_inicio: '07:00', // funcionamento inicia as 08:00
        hora_fim: '08:30'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'Reserva fora do horário de funcionamento (08:00 às 22:00).');
  });

  it('Deve impedir a criação de reserva (400) se a data for passada', async () => {
    const res = await request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2025-01-01', // data passada
        hora_inicio: '10:00',
        hora_fim: '11:00'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'Não é permitido criar agendamentos em datas passadas.');
  });

  it('Deve cancelar uma reserva com sucesso', async () => {
    const resCreate = await request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-15',
        hora_inicio: '10:00',
        hora_fim: '11:00'
      });

    const reservaId = resCreate.body.reserva_id;

    const resCancel = await request(app)
      .patch(`/api/reservas/${reservaId}/cancelar`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        motivo: -1,
        observacoes: 'Cliente ligou desistindo'
      });

    expect(resCancel.statusCode).toBe(200);
    expect(resCancel.body).toHaveProperty('message', 'Reserva cancelada com sucesso.');
  });

  it('Deve criar uma reserva com pagamento imediato no balcão e salvar com status_pagamento = Pago', async () => {
    const res = await request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        cliente_id: 1,
        quadra_id: 2,
        data_reserva: '2026-12-16',
        hora_inicio: '14:00',
        hora_fim: '15:00',
        valor_total: 120,
        pagamento: {
          registrar: true,
          metodo: 'Dinheiro',
          valor: 120
        }
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('status_pagamento', 'Pago');
    expect(res.body).toHaveProperty('reserva_id');

    // Verifica se o pagamento foi persistido na tabela Pagamentos
    const pmt = await db.getAsync('SELECT * FROM Pagamentos WHERE reserva_id = ?', [res.body.reserva_id]);
    expect(pmt).toBeDefined();
    expect(pmt.valor).toBe(120);
    expect(pmt.metodo).toBe('Dinheiro');
  });

  it('Deve criar uma reserva como Cortesia (R$ 0,00) e registrar status_pagamento = Pago', async () => {
    const res = await request(app)
      .post('/api/reservas')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        cliente_id: 1,
        quadra_id: 2,
        data_reserva: '2026-12-16',
        hora_inicio: '15:00',
        hora_fim: '16:00',
        valor_total: 0
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('valor_total', 0);
    expect(res.body).toHaveProperty('status_pagamento', 'Pago');
  });
});
