const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth, actors } = fixture;
const dates = require('../src/utils/dateUtils');
const app = require('../src/app');
beforeAll(fixture.initialize);
beforeEach(fixture.seed);
afterEach(() => vi.restoreAllMocks());
afterAll(fixture.close);

it('classifies trial by expiration in the arena timezone without changing operational status', async () => {
  const master = await fixture.login(app, actors.master);
  vi.spyOn(dates, 'getTodayString').mockImplementation(zone => zone === 'America/Manaus' ? '2030-01-01' : '2030-01-02');
  for (const [expiration, status, zone, expected] of [
    ['2030-01-03', 1, 'America/Sao_Paulo', true],
    ['2030-01-02', 1, 'America/Sao_Paulo', true],
    ['2030-01-01', 1, 'America/Sao_Paulo', false],
    ['2030-01-01', 1, 'America/Manaus', true],
    [null, 1, 'America/Sao_Paulo', false],
    ['2030-01-03', 0, 'America/Sao_Paulo', false],
  ]) {
    await db.runAsync('UPDATE Arenas SET trial_expira_em=?,status=?,fuso_horario=? WHERE id=1', [expiration, status, zone]);
    const response = await auth(request(app).get('/api/saas/arenas'), master);
    expect(response.status).toBe(200);
    expect(response.body.find(arena => arena.id === 1)).toMatchObject({ em_trial: expected, status, trial_expira_em: expiration });
    expect((await db.getAsync('SELECT status FROM Arenas WHERE id=1')).status).toBe(status);
  }
});
