const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth, actors } = fixture;
const app = require('../src/app');
beforeAll(fixture.initialize);
beforeEach(fixture.seed);
afterAll(fixture.close);
const body = { quadra_id: 1, data_bloqueio: '2099-12-01', hora_inicio: '14:00', hora_fim: '15:00', motivo: 'Manutencao' };
describe.each(['/api/quadras/bloqueios', '/api/reservas/bloqueios'])('%s', route => {
  it('rejects a court belonging to another arena without writing', async () => {
    const session = await fixture.login(app, actors.admin);
    const response = await auth(request(app).post(route), session).send({ ...body, quadra_id: 2 });
    expect(response.status).toBe(404);
    expect((await db.getAsync('SELECT COUNT(*) AS n FROM Bloqueios')).n).toBe(0);
  });
  it('does not let a receptionist bypass block permissions through an alternate URL', async () => {
    const session = await fixture.login(app, actors.receptionist);
    expect((await auth(request(app).post(route), session).send(body)).status).toBe(403);
    expect((await db.getAsync('SELECT COUNT(*) AS n FROM Bloqueios')).n).toBe(0);
  });
  it('creates a block for the authenticated arena', async () => {
    const session = await fixture.login(app, actors.manager);
    expect((await auth(request(app).post(route), session).send(body)).status).toBe(201);
    expect(await db.allAsync('SELECT quadra_id,criado_por FROM Bloqueios')).toEqual([{ quadra_id: 1, criado_por: actors.manager }]);
  });
  it('preserves a reservation instead of blocking its occupied time', async () => {
    const session = await fixture.login(app, actors.admin);
    expect((await auth(request(app).post(route), session).send({ ...body, hora_inicio: '10:00', hora_fim: '11:00' })).status).toBe(409);
    expect((await db.getAsync('SELECT COUNT(*) AS n FROM Bloqueios')).n).toBe(0);
  });
});
