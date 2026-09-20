const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth } = fixture;
const app = require('../src/app');

beforeAll(fixture.initialize);
beforeEach(async () => {
  await fixture.seed();
  // Limpa tudo
  await db.runAsync("DELETE FROM BookingCancellations");
  await db.runAsync("DELETE FROM PaymentAllocations");
  await db.runAsync("DELETE FROM Pagamentos");
  await db.runAsync("DELETE FROM Reservas");
  await db.runAsync("DELETE FROM Quadras");
  
  // Insere quadras
  await db.runAsync("INSERT INTO Quadras (id, tenant_id, nome, tipo, preco_base, hora_abertura, hora_fechamento, status, modalidades) VALUES (1, 1, 'Quadra 1 Areia', 'Areia', 10000, '08:00', '22:00', 'Ativa', '[{\"nome\":\"Geral\",\"preco\":10000}]')");
  await db.runAsync("INSERT INTO Quadras (id, tenant_id, nome, tipo, preco_base, hora_abertura, hora_fechamento, status, modalidades) VALUES (2, 1, 'Quadra 2 Padel', 'Saibro', 12000, '08:00', '22:00', 'Ativa', '[{\"nome\":\"Geral\",\"preco\":12000}]')");
});
afterAll(fixture.close);

const login = () => fixture.login(app, 1);

describe('Testes de Integração de Reservas e Validação de Conflito de Horário (RN-001)', () => {

  it('Deve criar uma reserva com sucesso na Quadra 1 se não houver conflito', async () => {
    const session = await login();
    const res = await auth(request(app).post('/api/reservas'), session)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-14', // data futura válida
        hora_inicio: '19:00',
        hora_fim: '20:30'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message', 'Reserva criada.');
    expect(res.body).toHaveProperty('valor_total', 150); // a API retorna em float (150)
    expect(res.body).toHaveProperty('reserva_id');
  });

  it('Deve impedir a criação de reserva (409) se houver sobreposição exata de horários', async () => {
    const session = await login();
    await auth(request(app).post('/api/reservas'), session).send({cliente_id:1,quadra_id:1,data_reserva:'2026-12-14',hora_inicio:'19:00',hora_fim:'20:30'});
    
    const res = await auth(request(app).post('/api/reservas'), session)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-14',
        hora_inicio: '19:00',
        hora_fim: '20:30'
      });

    expect(res.body).toHaveProperty('error', 'Horário já reservado.');
  });

  it('Deve impedir a criação de reserva (409) se houver sobreposição parcial (dentro do intervalo)', async () => {
    const session = await login();
    await auth(request(app).post('/api/reservas'), session).send({cliente_id:1,quadra_id:1,data_reserva:'2026-12-14',hora_inicio:'19:00',hora_fim:'20:30'});

    const res = await auth(request(app).post('/api/reservas'), session)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-14',
        hora_inicio: '19:30',
        hora_fim: '20:00'
      });

    expect(res.statusCode).toBe(409);
    expect(res.body).toHaveProperty('error', 'Horário já reservado.');
  });

  it('Deve criar a reserva com sucesso se o horário iniciar exatamente quando a outra termina (boundary check)', async () => {
    const session = await login();
    await auth(request(app).post('/api/reservas'), session).send({cliente_id:1,quadra_id:1,data_reserva:'2026-12-14',hora_inicio:'19:00',hora_fim:'20:30'});

    const res = await auth(request(app).post('/api/reservas'), session)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-14',
        hora_inicio: '20:30',
        hora_fim: '21:30'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message', 'Reserva criada.');
  });

  it('Deve criar a reserva com sucesso se for no mesmo horário, mas em outra quadra', async () => {
    const session = await login();
    await auth(request(app).post('/api/reservas'), session).send({cliente_id:1,quadra_id:1,data_reserva:'2026-12-14',hora_inicio:'19:00',hora_fim:'20:30'});

    const res = await auth(request(app).post('/api/reservas'), session)
      .send({
        cliente_id: 1,
        quadra_id: 2, // Quadra 2 está livre nesse horário
        data_reserva: '2026-12-14',
        hora_inicio: '19:00',
        hora_fim: '20:30'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('message', 'Reserva criada.');
    expect(res.body).toHaveProperty('valor_total', 180);
    expect(res.body).toHaveProperty('reserva_id');
  });

  it('Deve impedir a criação de reserva (400) se o horário estiver fora de expediente', async () => {
    const session = await login();
    const res = await auth(request(app).post('/api/reservas'), session)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-14',
        hora_inicio: '07:00', // funcionamento inicia as 08:00
        hora_fim: '08:30'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'Horário fora do funcionamento.');
  });

  it('Deve impedir a criação de reserva (400) se a data for passada', async () => {
    const session = await login();
    const res = await auth(request(app).post('/api/reservas'), session)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2025-01-01', // data passada
        hora_inicio: '10:00',
        hora_fim: '11:00'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'Horário já encerrou.');
  });

  it('Deve cancelar uma reserva com sucesso', async () => {
    const session = await login();
    const resCreate = await auth(request(app).post('/api/reservas'), session)
      .send({
        cliente_id: 1,
        quadra_id: 1,
        data_reserva: '2026-12-15',
        hora_inicio: '10:00',
        hora_fim: '11:00'
      });

    const reservaId = resCreate.body.reserva_id;

    const resCancel = await auth(request(app).patch(`/api/reservas/${reservaId}/cancelar`), session)
      .send({
        motivo: -1,
        observacoes: 'Cliente ligou desistindo'
      });

    expect(resCancel.statusCode).toBe(200);
    expect(resCancel.body).toHaveProperty('message', 'Reserva cancelada.');
  });

  it('Deve criar uma reserva com pagamento imediato no balcão e salvar com status_pagamento = Pago', async () => {
    const session = await login();
    const res = await auth(request(app).post('/api/reservas'), session)
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
    expect(pmt.valor).toBe(12000); // centavos
    expect(pmt.metodo).toBe('Dinheiro');
  });

  it('Deve criar uma reserva como Cortesia (R$ 0,00) e registrar status_pagamento = Pago', async () => {
    const session = await login();
    const res = await auth(request(app).post('/api/reservas'), session)
      .send({
        cliente_id: 1,
        quadra_id: 2,
        data_reserva: '2026-12-16',
        hora_inicio: '15:00',
        hora_fim: '16:00',
        valor_total: 0,
        justificativa_desconto: 'Cortesia do dono'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('valor_total', 0);
    expect(res.body).toHaveProperty('status_pagamento', 'Pago');
  });
});
