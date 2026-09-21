const request = require('supertest');
const app = require('../src/app');
const { checkoutContact } = require('../src/services/bookingService');
const { db, initialize, seed } = require('./helpers/securityFixture.cjs');

beforeAll(async () => {
  await initialize();
});

beforeEach(async () => {
  await seed();
});

it('validates guest contact data on the server', () => {
  expect(() => checkoutContact({ nome: 'A', telefone: 'abc' })).toThrow(/Nome e telefone/);
  expect(() => checkoutContact({ nome: 'Visitante', telefone: '11999999999', email: 'invalid' })).toThrow(/Contato inválido/);
  expect(() => checkoutContact({ nome: 'Visitante', telefone: '11999999999', cpf: '123' })).toThrow(/Contato inválido/);
  expect(checkoutContact({
    nome: ' Visitante Seguro ',
    telefone: '(11) 99999-9999',
    email: 'visitante@example.test',
    cpf: '123.456.789-01'
  })).toEqual({
    nome: 'Visitante Seguro',
    telefone: '(11) 99999-9999',
    email: 'visitante@example.test',
    cpf: '123.456.789-01'
  });
});

it('rolls back the booking if its scoped guest capability cannot be persisted', async () => {
  const before = {
    reservas: (await db.getAsync('SELECT COUNT(*) AS count FROM Reservas')).count,
    clientes: (await db.getAsync('SELECT COUNT(*) AS count FROM Clientes')).count,
    contacts: (await db.getAsync('SELECT COUNT(*) AS count FROM BookingContacts')).count
  };
  await db.runAsync(`
    CREATE TRIGGER reject_guest_access
    BEFORE INSERT ON GuestAccess
    BEGIN
      SELECT RAISE(ABORT, 'guest access unavailable');
    END
  `);

  const response = await request(app)
    .post('/api/public/tenant/arena-a/agendar')
    .send({
      nome: 'Visitante Seguro',
      telefone: '11999999999',
      quadra_id: 1,
      data_reserva: '2099-12-22',
      hora_inicio: '10:00',
      hora_fim: '11:00'
    });

  expect(response.status).toBe(500);
  expect(response.headers['set-cookie']).toBeUndefined();
  expect((await db.getAsync('SELECT COUNT(*) AS count FROM Reservas')).count).toBe(before.reservas);
  expect((await db.getAsync('SELECT COUNT(*) AS count FROM Clientes')).count).toBe(before.clientes);
  expect((await db.getAsync('SELECT COUNT(*) AS count FROM BookingContacts')).count).toBe(before.contacts);
});
