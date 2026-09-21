const request = require('supertest');
const app = require('../src/app');
const { db, initialize, seed, login, auth } = require('./helpers/securityFixture.cjs');

let admin;

beforeAll(async () => {
  await initialize();
});

beforeEach(async () => {
  await seed();
  admin = await login(app);
});

async function getReport(path) {
  return auth(request(app).get(`/api/relatorios/${path}`), admin);
}

it('rejects malformed, inverted and excessive report periods with HTTP 400', async () => {
  const malformed = await getReport('reservas?data_inicio=invalid&data_fim=2099-12-01');
  expect(malformed.status).toBe(400);
  expect(malformed.body.error).toMatch(/AAAA-MM-DD/);

  const impossible = await getReport('reservas?data_inicio=2099-02-30&data_fim=2099-03-01');
  expect(impossible.status).toBe(400);
  expect(impossible.body.error).toMatch(/inválida/);

  const inverted = await getReport('reservas?data_inicio=2099-12-02&data_fim=2099-12-01');
  expect(inverted.status).toBe(400);
  expect(inverted.body.error).toMatch(/igual ou posterior/);

  const excessive = await getReport('reservas?data_inicio=2098-01-01&data_fim=2099-12-31');
  expect(excessive.status).toBe(400);
  expect(excessive.body.error).toMatch(/366 dias/);
});

it('rejects invalid pages and limits above the fixed maximum', async () => {
  for (const query of ['pagina=0', 'pagina=-1', 'limite=-1', 'limite=1.5', 'limite=101']) {
    const response = await getReport(`top-clientes?data_inicio=2099-12-01&data_fim=2099-12-31&${query}`);
    expect(response.status, query).toBe(400);
  }
});

it('paginates in SQL while preserving totals for the complete period and tenant', async () => {
  await db.runAsync('DELETE FROM Pagamentos');
  await db.runAsync('DELETE FROM Reservas');
  const statements = [];
  for (let index = 1; index <= 105; index += 1) {
    statements.push(`(
      ${1000 + index},1,1,1,'2099-12-01','10:00','11:00',100,'Confirmada','Pendente'
    )`);
  }
  statements.push("(9999,2,3,2,'2099-12-01','10:00','11:00',50000,'Confirmada','Pendente')");
  await db.runAsync(`
    INSERT INTO Reservas(
      id,tenant_id,cliente_id,quadra_id,data_reserva,hora_inicio,hora_fim,
      valor_total,status,status_pagamento
    ) VALUES ${statements.join(',')}
  `);

  const page = await getReport('reservas?data_inicio=2099-12-01&data_fim=2099-12-01&pagina=3&limite=50');
  expect(page.status).toBe(200);
  expect(page.body.reservas).toHaveLength(5);
  expect(page.body.totais).toMatchObject({ total: 105, confirmadas: 105 });
  expect(page.body.paginacao).toMatchObject({ pagina: 3, limite: 50, total: 105, totalPaginas: 3, temProxima: false });

  const billing = await getReport('faturamento?data_inicio=2099-12-01&data_fim=2099-12-01&pagina=2&limite=10');
  expect(billing.status).toBe(200);
  expect(billing.body.reservas).toHaveLength(10);
  expect(billing.body.totais).toEqual({ bruto: 105, pago: 0, pendente: 105 });
  expect(billing.body.paginacao).toMatchObject({ pagina: 2, limite: 10, total: 105, totalPaginas: 11 });
});

it('caps every paginated report endpoint consistently', async () => {
  for (const endpoint of ['faturamento', 'reservas', 'inadimplencia', 'cancelamentos', 'formas-pagamento', 'top-clientes']) {
    const response = await getReport(`${endpoint}?data_inicio=2099-12-01&data_fim=2099-12-31&limite=1000000`);
    expect(response.status, endpoint).toBe(400);
    expect(response.body.error).toMatch(/maior que 100/);
  }
});
