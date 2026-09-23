const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth, actors } = fixture;
const app = require('../src/app');
beforeAll(fixture.initialize);
beforeEach(fixture.seed);
afterAll(fixture.close);
it('counts current valid sessions once per user and excludes revoked, expired and changed credentials', async () => {
  const master = await fixture.login(app, actors.master);
  const first = await fixture.login(app, actors.admin);
  const second = await fixture.login(app, actors.admin);
  const list = async () => {
    const response = await auth(request(app).get('/api/saas/sessoes'), master);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toMatch(/password_hash|senha_hash|token_hash/);
    return response.body;
  };
  expect((await list()).find(group => group.arenaId === 1).users).toBe(1);
  await auth(request(app).post('/api/auth/logout'), first);
  expect((await list()).find(group => group.arenaId === 1).users).toBe(1);
  await auth(request(app).post('/api/auth/logout'), second);
  expect((await list()).some(group => group.arenaId === 1)).toBe(false);
  await fixture.login(app, actors.admin);
  await db.runAsync('UPDATE AuthSessions SET expires=0 WHERE usuario_id=?', [actors.admin]);
  expect((await list()).some(group => group.arenaId === 1)).toBe(false);
  await fixture.login(app, actors.admin);
  await db.runAsync("UPDATE Usuarios SET senha_hash='changed' WHERE id=?", [actors.admin]);
  expect((await list()).some(group => group.arenaId === 1)).toBe(false);
});
