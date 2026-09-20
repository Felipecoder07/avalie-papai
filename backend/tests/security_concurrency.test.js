const request = require('supertest');
const fixture = require('./helpers/securityFixture.cjs');
const { db, auth, actors } = fixture;
vi.spyOn(require('../src/services/emailService'), 'sendEmail').mockResolvedValue(true);
const app = require('../src/app');
const login = id => fixture.login(app, id);
beforeAll(fixture.initialize);
beforeEach(fixture.seed);
afterAll(fixture.close);

describe('Actor matrix — real sessions, two arenas and account states', () => {
  const matrix = [
    ['anonymous', null, 401, null],
    ['owner', actors.owner, 403, null],
    ['third client', actors.third, 403, null],
    ['receptionist A', actors.receptionist, 200, 1],
    ['manager A', actors.manager, 200, 1],
    ['administrator A', actors.admin, 200, 1],
    ['SuperAdmin', actors.master, 403, null],
    ['client B', actors.otherOwner, 403, null],
    ['receptionist B', actors.otherReceptionist, 200, 2],
    ['manager B', actors.otherManager, 200, 2],
    ['administrator B', actors.otherAdmin, 200, 2],
  ];
  it.each(matrix)('%s: administrative client list', async (_, id, status, tenant) => {
    const session = id ? await login(id) : null;
    const response = await auth(request(app).get('/api/clientes'), session);
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toContain('application/json');
    if (status === 200) {
      expect(response.body.length).toBeGreaterThan(0);
      // The public response intentionally omits tenant_id. Compare concrete
      // fixture IDs, rather than treating a missing field as isolation proof.
      expect(response.body.map(client => client.id).sort()).toEqual(tenant === 1 ? [1,2] : [3]);
    } else {
      expect(response.body).toHaveProperty('error');
      expect(JSON.stringify(response.body)).not.toMatch(/owner@example|foreign@example|11111111111|33333333333/);
    }
  });

  it.each(Object.entries(actors).flatMap(([name,id]) => ['blocked','deleted'].map(state => [name,id,state])))('%s account %s %s cannot reuse its session', async (_, id, state) => {
    const session = await login(id);
    expect((await auth(request(app).get('/api/auth/me'), session)).status).toBe(200);
    if (state === 'blocked') await db.runAsync('UPDATE Usuarios SET ativo=0 WHERE id=?', [id]);
    else await db.runAsync('DELETE FROM Usuarios WHERE id=?', [id]);
    const response = await auth(request(app).get('/api/auth/me'), session);
    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('usuario');
    const relogin = await request(app).post('/api/auth/login').send({ email:'u'+id+'@example.test', senha:fixture.PASSWORD });
    expect(relogin.status).toBe(state === 'blocked' ? 403 : 401);
    expect(relogin.headers['set-cookie']).toBeUndefined();
  });

  it.each([[0,403],[-1,403]])('suspended or removed arena (%s) denies protected requests', async (state,status) => {
    const session = await login(actors.admin);
    await db.runAsync('UPDATE Arenas SET status=? WHERE id=1', [state]);
    expect((await auth(request(app).get('/api/clientes'),session)).status).toBe(status);
    const other = await login(actors.otherAdmin);
    expect((await auth(request(app).get('/api/clientes'),other)).status).toBe(200);
  });

  it('master route is mounted, requires MFA and redacts actual secret fixtures', async () => {
    const master = await login(actors.master);
    const response = await auth(request(app).get('/api/saas/configuracoes'),master);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({has_mp_client_secret:true,has_mp_master_access_token:true,has_mp_webhook_secret:true});
    expect(JSON.stringify(response.body)).not.toMatch(/FIXTURE-MASTER-SECRET|FIXTURE-CLIENT-SECRET|fixture-webhook-secret/);
    const admin = await login(actors.admin);
    expect((await auth(request(app).get('/api/saas/configuracoes'),admin)).status).toBe(403);
  });
});

describe('Actual mounted routes and concurrent SQLite effects', () => {
  it('cross-tenant cancellation is denied; the same endpoint works for the owning arena', async () => {
    const other = await login(actors.otherAdmin);
    const denied = await auth(request(app).patch('/api/reservas/1/cancelar'),other).send({motivo:-1});
    expect(denied.status).toBe(404);
    expect(denied.headers['content-type']).toContain('application/json');
    expect(denied.body).toEqual({error:'Reserva não encontrada.'});
    expect((await db.getAsync('SELECT status FROM Reservas WHERE id=1')).status).toBe('Pendente');
    const owner = await login(actors.admin);
    const allowed = await auth(request(app).patch('/api/reservas/1/cancelar'),owner).send({motivo:-1});
    expect(allowed.status).toBe(200);
    expect((await db.getAsync('SELECT status FROM Reservas WHERE id=1')).status).toBe('Cancelada');
  });

  it('tenant injection cannot change the arena of a successfully created booking', async () => {
    const session = await login(actors.admin);
    const response = await auth(request(app).post('/api/reservas'),session).send({tenant_id:2,cliente_id:1,quadra_id:1,data_reserva:'2099-12-20',hora_inicio:'10:00',hora_fim:'11:00'});
    expect(response.status).toBe(201);
    expect(response.body.reserva_id).toBeTypeOf('number');
    expect(await db.getAsync('SELECT tenant_id,cliente_id,valor_total FROM Reservas WHERE id=?',[response.body.reserva_id])).toEqual({tenant_id:1,cliente_id:1,valor_total:10000});
  });

  it('simultaneous bookings produce one row, one price and exactly one conflict', async () => {
    const session = await login(actors.admin);
    const body = {cliente_id:1,quadra_id:1,data_reserva:'2099-12-20',hora_inicio:'10:00',hora_fim:'11:00'};
    const responses = await Promise.all([1,2].map(() => auth(request(app).post('/api/reservas'),session).send(body)));
    expect(responses.map(r => r.status).sort()).toEqual([201,409]);
    expect(await db.getAsync("SELECT COUNT(*) AS count,SUM(valor_total) AS total FROM Reservas WHERE data_reserva='2099-12-20'")).toEqual({count:1,total:10000});
  });

  it('logout revokes the exact cookie that previously read protected data', async () => {
    const session = await login(actors.owner);
    const route = '/api/public/tenant/arena-a/meu-perfil';
    expect((await auth(request(app).get(route),session)).status).toBe(200);
    expect((await auth(request(app).post('/api/auth/logout'),session)).status).toBe(200);
    expect((await auth(request(app).get(route),session)).status).toBe(401);
    expect((await db.getAsync('SELECT revoked FROM AuthSessions WHERE usuario_id=2')).revoked).toBe(1);
  });
});
