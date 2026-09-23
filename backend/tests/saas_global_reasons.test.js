const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth, actors } = fixture;
const app = require('../src/app');
beforeAll(fixture.initialize);
beforeEach(async () => {
  await db.runAsync('DELETE FROM MotivosCancelamento');
  await fixture.seed();
  await db.runAsync("INSERT INTO MotivosCancelamento(tenant_id,motivo) VALUES(NULL,'Global anterior'),(1,'Motivo da arena')");
});
afterAll(fixture.close);

it('reads and replaces global reasons with foreign keys enabled, preserving arena reasons', async () => {
  const session = await fixture.login(app, actors.master);
  const get = await auth(request(app).get('/api/saas/configuracoes'), session);
  expect(get.status).toBe(200);
  expect(get.body.reasons).toEqual(['Global anterior']);
  const updated = await auth(request(app).put('/api/saas/configuracoes'), session)
    .send({ reasons: [' Novo motivo ', 'Outro motivo'] });
  expect(updated.status).toBe(200);
  expect(await db.allAsync('SELECT tenant_id,motivo FROM MotivosCancelamento ORDER BY id')).toEqual([
    { tenant_id: 1, motivo: 'Motivo da arena' },
    { tenant_id: null, motivo: 'Novo motivo' },
    { tenant_id: null, motivo: 'Outro motivo' },
  ]);
  expect(await db.allAsync('PRAGMA foreign_key_check')).toEqual([]);
});

it('rejects malformed reasons and rolls back the entire settings update', async () => {
  const session = await fixture.login(app, actors.master);
  await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS(chave,valor) VALUES('dias_trial','14')");
  const response = await auth(request(app).put('/api/saas/configuracoes'), session)
    .send({ dias_trial: 99, reasons: ['Valido', null] });
  expect(response.status).toBe(400);
  expect((await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave='dias_trial'")).valor).toBe('14');
  expect((await db.getAsync('SELECT motivo FROM MotivosCancelamento WHERE tenant_id IS NULL')).motivo).toBe('Global anterior');
});
