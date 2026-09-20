const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth } = fixture;
const app = require('../src/app');

describe('Testes de Integração Financeira — Regras de Caixa, Descontos e Estornos', () => {

  beforeAll(fixture.initialize);
  beforeEach(async () => {
    await fixture.seed();
    await db.runAsync("DELETE FROM BookingCancellations");
    await db.runAsync("DELETE FROM PaymentAllocations");
    await db.runAsync("DELETE FROM Pagamentos");
    await db.runAsync("DELETE FROM Reservas");
    
    // Cadastra Reservas (100.00 e 120.00 em centavos = 10000 e 12000)
    await db.runAsync(`
      INSERT INTO Reservas (id, tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total, status, status_pagamento) 
      VALUES (100, 1, 1, 1, '2026-12-15', '10:00', '11:00', 10000, 'Confirmada', 'Pendente')
    `);
    await db.runAsync(`
      INSERT INTO Reservas (id, tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total, status, status_pagamento) 
      VALUES (200, 2, 3, 2, '2026-12-15', '10:00', '11:00', 12000, 'Confirmada', 'Pendente')
    `);
  });
  afterAll(fixture.close);

  it('Deve rejeitar o registro de pagamento com método de pagamento inválido', async () => {
    const session = await fixture.login(app, 1);
    const res = await auth(request(app).post('/api/pagamentos'), session)
      .send({
        reserva_id: 100,
        valor: 50.0,
        metodo: 'MetodoInvalido'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Metodo manual invalido');
  });

  it('Deve registrar um pagamento parcial com sucesso se o método for válido', async () => {
    const session = await fixture.login(app, 1);
    const res = await auth(request(app).post('/api/pagamentos'), session)
      .send({
        reserva_id: 100,
        valor: 60.0,
        metodo: 'Pix'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message', 'Pagamento registrado.');
    expect(res.body).toHaveProperty('saldo_devedor', 4000); // centavos
    expect(res.body).toHaveProperty('status_pagamento', 'Parcial');
  });

  it('Deve rejeitar desconto negativo ou maior que 100%', async () => {
    const session = await fixture.login(app, 1);
    const resNeg = await auth(request(app).post('/api/pagamentos/desconto'), session)
      .send({
        reserva_id: 100,
        desconto_percentual: -10
      });
    expect(resNeg.statusCode).toBe(400);

    const resOver = await auth(request(app).post('/api/pagamentos/desconto'), session)
      .send({
        reserva_id: 100,
        desconto_percentual: 110
      });
    expect(resOver.statusCode).toBe(400);
  });

  it('Deve rejeitar desconto que reduza o valor total para menos do que já foi pago', async () => {
    const session = await fixture.login(app, 1);
    await auth(request(app).post('/api/pagamentos'), session).send({ reserva_id: 100, valor: 60, metodo: 'Pix' });
    const res = await auth(request(app).post('/api/pagamentos/desconto'), session)
      .send({
        reserva_id: 100,
        desconto_percentual: 50 // reduces from 10000 to 5000, but already paid 6000
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Desconto abaixo do recebido');
  });

  it('Deve aplicar desconto com sucesso se respeitar o limite pago', async () => {
    const session = await fixture.login(app, 1);
    const res = await auth(request(app).post('/api/pagamentos/desconto'), session)
      .send({
        reserva_id: 100,
        desconto_percentual: 30
      });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('novo_valor_total', 7000);
    expect(res.body).toHaveProperty('saldo_devedor', 7000);
  });

  it('Deve impedir novos pagamentos se a reserva estiver cancelada', async () => {
    await db.runAsync("UPDATE Reservas SET status = 'Cancelada' WHERE id = 200");
    const session = await fixture.login(app, 4); // admin of tenant 2

    const res = await auth(request(app).post('/api/pagamentos'), session)
      .send({
        reserva_id: 200,
        valor: 50.0,
        metodo: 'Dinheiro'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Reserva cancelada');
  });

  it('Deve impedir o estorno de valor maior do que o saldo líquido pago', async () => {
    const session = await fixture.login(app, 1);
    await auth(request(app).post('/api/pagamentos'), session).send({ reserva_id: 100, valor: 60, metodo: 'Pix' });

    const res = await auth(request(app).post('/api/pagamentos/estorno'), session)
      .send({
        reserva_id: 100,
        valor: 70.0,
        motivo: 'Estorno de teste excessivo'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Valor acima do saldo estornavel');
  });

  it('Deve permitir estorno parcial com sucesso e atualizar saldo/status', async () => {
    const session = await fixture.login(app, 1);
    await auth(request(app).post('/api/pagamentos'), session).send({ reserva_id: 100, valor: 60, metodo: 'Pix' });

    const res = await auth(request(app).post('/api/pagamentos/estorno'), session)
      .send({
        reserva_id: 100,
        valor: 40.0,
        motivo: 'Estorno de teste parcial'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('saldo_devedor', 8000); // 10000 - (6000 - 4000) = 8000
    expect(res.body).toHaveProperty('status_pagamento', 'Parcial');
  });

  it('SaaS Multi-Tenant Isolation (IDOR check): Não deve permitir ler histórico de pagamentos de outra arena', async () => {
    const session = await fixture.login(app, 1);
    const res = await auth(request(app).get('/api/pagamentos/reserva/200'), session);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });
});
