const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASS = '';
const db = require('../src/config/database');
const initDb = require('../src/config/init_db');
// Simula somente serviços externos; rotas, autorização e SQLite são reais.
const emailService = require('../src/services/emailService');
const sendEmail = vi.spyOn(emailService, 'sendEmail').mockResolvedValue(true);
const app = require('../src/app');
const { estornarPagamentoPix } = require('../src/services/gatewayService');
const secret = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';
const base = '/api/pagamentos/gateway';
const token = (perfil, tenant_id = 97001, cliente_id = 97001) =>
  jwt.sign({ id: cliente_id, perfil, tenant_id, cliente_id }, secret, { expiresIn: '1h' });
const owner = token('Cliente');
const otherClient = token('Cliente', 97001, 97002);
const admin = token('Administrador');
const otherAdmin = token('Administrador', 97002, 97003);
let provider;

async function cleanup() {
  await db.runAsync('DELETE FROM OAuthStates');
  await db.runAsync('DELETE FROM OAuthCodesUsados');
  await db.runAsync('DELETE FROM TransacoesGateway WHERE reserva_id = 97001');
  await db.runAsync('DELETE FROM Pagamentos WHERE reserva_id = 97001');
  await db.runAsync('DELETE FROM Reservas WHERE id = 97001');
  await db.runAsync('DELETE FROM Quadras WHERE id = 97001');
  await db.runAsync('DELETE FROM Clientes WHERE id IN (97001, 97002)');
  await db.runAsync('DELETE FROM Arenas WHERE id IN (97001, 97002)');
}
function respond(data, ok = true) {
  provider.mockResolvedValueOnce({ ok, json: async () => data });
}
function charge(metodo = 'Pix', authorization = owner, extra = {}) {
  return request(app).post(`${base}/cobranca`).set('Authorization', `Bearer ${authorization}`)
    .send({ reserva_id: 97001, metodo, ...extra });
}
async function seedTransaction(metodo = 'Pix') {
  await db.runAsync("INSERT INTO TransacoesGateway (reserva_id, gateway_ref, metodo, valor, status) VALUES (97001, '970001', ?, 100, 'Pendente')", [metodo]);
}
async function assertUnpaid() {
  expect(await db.getAsync('SELECT COUNT(*) AS total FROM Pagamentos WHERE reserva_id = 97001')).toEqual({ total: 0 });
  expect(await db.getAsync('SELECT status, status_pagamento FROM Reservas WHERE id = 97001'))
    .toEqual({ status: 'Pendente', status_pagamento: 'Pendente' });
}

describe('Gateway — contratos HTTP, liquidação e isolamento', () => {
  beforeAll(async () => {
    initDb();
    await new Promise(resolve => setTimeout(resolve, 1000));
  });
  beforeEach(async () => {
    await cleanup();
    await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES ('manutencao_ativa', '0')");
    await db.runAsync(`INSERT INTO Arenas (id, nome, status, gateway_access_token, gateway_device_id)
      VALUES (97001, 'Arena Gateway Teste', 1, 'TEST-ONLY-NOT-A-REAL-TOKEN', 'device_test_123'),
             (97002, 'Outra Arena Teste', 1, NULL, NULL)`);
    await db.runAsync(`INSERT INTO Clientes (id, tenant_id, nome, email)
      VALUES (97001, 97001, 'Cliente Teste', 'gateway-owner@example.test'),
             (97002, 97001, 'Outro Cliente', 'gateway-other@example.test')`);
    await db.runAsync("INSERT INTO Quadras (id, tenant_id, nome, preco_base) VALUES (97001, 97001, 'Quadra Teste', 100)");
    await db.runAsync(`INSERT INTO Reservas
      (id, tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total, status, status_pagamento)
      VALUES (97001, 97001, 97001, 97001, '2099-12-15', '10:00', '11:00', 100, 'Pendente', 'Pendente')`);
    provider = vi.fn().mockRejectedValue(new Error('Chamada externa sem resposta simulada no teste'));
    vi.stubGlobal('fetch', provider);
    sendEmail.mockClear();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  afterAll(async () => { await cleanup(); sendEmail.mockRestore(); });

  it('cria Pix com QR code, valor correto e credencial da arena', async () => {
    respond({ id: 970001, point_of_interaction: { transaction_data: { qr_code_base64: 'cXItZmljdGljaW8=', qr_code: 'pix-ficticio' } } });
    const res = await charge();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ gateway_ref: '970001', copia_cola: 'pix-ficticio', qr_code: 'data:image/png;base64,cXItZmljdGljaW8=' });
    expect(provider).toHaveBeenCalledTimes(1);
    const [url, options] = provider.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/v1/payments');
    expect(options.headers.Authorization).toBe('Bearer TEST-ONLY-NOT-A-REAL-TOKEN');
    expect(JSON.parse(options.body)).toMatchObject({ transaction_amount: 100, payment_method_id: 'pix' });
    expect(await db.getAsync("SELECT valor, status FROM TransacoesGateway WHERE gateway_ref = '970001'"))
      .toEqual({ valor: 100, status: 'Pendente' });
    await assertUnpaid();
  });
  it('não registra cobrança nem pagamento se o provedor rejeitar a requisição', async () => {
    respond({ message: 'Cobrança recusada no teste' }, false);
    const res = await charge();
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain('Cobrança recusada no teste');
    expect(await db.getAsync('SELECT COUNT(*) AS total FROM TransacoesGateway WHERE reserva_id = 97001')).toEqual({ total: 0 });
    await assertUnpaid();
  });
  it.each([['outro cliente', otherClient], ['administrador de outra arena', otherAdmin]])('rejeita cobrança por %s', async (_, authorization) => {
    respond({ id: 970001, point_of_interaction: { transaction_data: { qr_code_base64: 'test', qr_code: 'test' } } });
    const res = await charge('Pix', authorization);
    expect(res.statusCode).toBe(403);
    expect(provider).not.toHaveBeenCalled();
    expect(await db.getAsync('SELECT COUNT(*) AS total FROM TransacoesGateway WHERE reserva_id = 97001')).toEqual({ total: 0 });
  });
  it('retorna o status exato da reserva ao proprietário', async () => {
    const res = await request(app).get(`${base}/status/97001`).set('Authorization', `Bearer ${owner}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'Pendente', status_pagamento: 'Pendente' });
  });
  it.each([['outro cliente', otherClient], ['outra arena', otherAdmin]])('nega consulta de status por %s', async (_, authorization) => {
    const res = await request(app).get(`${base}/status/97001`).set('Authorization', `Bearer ${authorization}`);
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toHaveProperty('status_pagamento');
  });
  it('não expõe credenciais de pagamento para um cliente', async () => {
    const res = await request(app).get(`${base}/maquineta`).set('Authorization', `Bearer ${owner}`);
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toHaveProperty('gateway_access_token');
  });
  it('salva e consulta a configuração da maquineta como administrador', async () => {
    const config = { gateway_device_id: 'device_test_456', gateway_access_token: 'TEST-NEW-FAKE-TOKEN', gateway_public_key: 'TEST-FAKE-PUBLIC' };
    const res = await request(app).post(`${base}/maquineta`).set('Authorization', `Bearer ${admin}`).send(config);
    expect(res.statusCode).toBe(200);
    const read = await request(app).get(`${base}/maquineta`).set('Authorization', `Bearer ${admin}`);
    expect(read.statusCode).toBe(200);
    expect(read.body).toEqual({ gateway_device_id: config.gateway_device_id, gateway_public_key: config.gateway_public_key, gateway_connected: true });
    expect(JSON.stringify(read.body)).not.toContain(config.gateway_access_token);
    expect(await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id = 97001'))
      .toEqual({ gateway_access_token: config.gateway_access_token });
  });
  it.each([undefined, '', '   ', null])('preserva a credencial ao salvar configuração sem uma nova chave (%s)', async credential => {
    const res = await request(app).post(`${base}/maquineta`).set('Authorization', `Bearer ${admin}`)
      .send({ gateway_device_id: 'device_new_456', gateway_access_token: credential });
    expect(res.statusCode).toBe(200);
    expect(await db.getAsync('SELECT gateway_access_token, gateway_device_id FROM Arenas WHERE id = 97001'))
      .toEqual({ gateway_access_token: 'TEST-ONLY-NOT-A-REAL-TOKEN', gateway_device_id: 'device_new_456' });
  });
  it('preserva os outros campos ao substituir somente a credencial', async () => {
    const res = await request(app).post(`${base}/maquineta`).set('Authorization', `Bearer ${admin}`)
      .send({ gateway_access_token: '  TEST-REPLACEMENT  ' });
    expect(res.statusCode).toBe(200);
    expect(await db.getAsync('SELECT gateway_access_token, gateway_device_id FROM Arenas WHERE id = 97001'))
      .toEqual({ gateway_access_token: 'TEST-REPLACEMENT', gateway_device_id: 'device_test_123' });
  });
  it.each(['Cliente', 'Recepcionista', 'Colaborador', 'desconhecido'])('impede que %s consulte ou altere a conexão', async perfil => {
    const auth = `Bearer ${token(perfil)}`;
    expect((await request(app).get(`${base}/maquineta`).set('Authorization', auth)).statusCode).toBe(403);
    expect((await request(app).post(`${base}/maquineta`).set('Authorization', auth).send({ gateway_access_token: 'OTHER' })).statusCode).toBe(403);
    expect((await request(app).post(`${base}/oauth/desconectar`).set('Authorization', auth)).statusCode).toBe(403);
    expect((await request(app).get(`${base}/oauth/url`).set('Authorization', auth)).statusCode).toBe(403);
    expect((await request(app).post(`${base}/oauth/exchange`).set('Authorization', auth).send({ code: 'fake', state: '97001' })).statusCode).toBe(403);
    expect(await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id = 97001')).toEqual({ gateway_access_token: 'TEST-ONLY-NOT-A-REAL-TOKEN' });
    expect(provider).not.toHaveBeenCalled();
  });
  it.each(['Administrador', 'Gerente'])('permite desconexão explícita pelo %s da arena', async perfil => {
    const auth = `Bearer ${token(perfil)}`;
    const res = await request(app).post(`${base}/oauth/desconectar`).set('Authorization', auth);
    expect(res.statusCode).toBe(200);
    expect(await db.getAsync('SELECT gateway_access_token, gateway_device_id FROM Arenas WHERE id = 97001'))
      .toEqual({ gateway_access_token: null, gateway_device_id: 'device_test_123' });
    const read = await request(app).get(`${base}/maquineta`).set('Authorization', auth);
    expect(read.statusCode).toBe(200);
    expect(read.body.gateway_connected).toBe(false);
    expect(read.body).not.toHaveProperty('gateway_access_token');
  });
  it('nega configuração para administrador sem arena vinculada', async () => {
    const auth = `Bearer ${token('Administrador', null)}`;
    const res = await request(app).get(`${base}/maquineta`).set('Authorization', auth);
    expect(res.statusCode).toBe(403);
  });
  it.each(['Administrador', 'Gerente', 'Recepcionista', 'Colaborador'])('preserva cobrança e consulta pelo %s da própria arena', async perfil => {
    respond({ id: 970001, point_of_interaction: { transaction_data: { qr_code_base64: 'test', qr_code: 'test' } } });
    const auth = token(perfil);
    expect((await charge('Pix', auth)).statusCode).toBe(200);
    expect((await request(app).get(`${base}/status/97001`).set('Authorization', `Bearer ${auth}`)).statusCode).toBe(200);
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it.each(['Gerente', 'Recepcionista', 'Colaborador', 'Cliente'])('nega cobrança e status de outra arena ao %s', async perfil => {
    const auth = token(perfil, 97002);
    expect((await charge('Pix', auth)).statusCode).toBe(403);
    expect((await request(app).get(`${base}/status/97001`).set('Authorization', `Bearer ${auth}`)).statusCode).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it.each([
    ['Administrador', null, 97001], ['Cliente', null, 97001], ['Cliente', 97001, null], ['desconhecido', 97001, 97001], ['cliente', 97001, 97001]
  ])('nega acesso com vínculo ou perfil inválido (%s, %s, %s)', async (perfil, tenantId, clientId) => {
    const auth = token(perfil, tenantId, clientId);
    expect((await charge('Pix', auth)).statusCode).toBe(403);
    expect((await request(app).get(`${base}/status/97001`).set('Authorization', `Bearer ${auth}`)).statusCode).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it('preserva o acesso global explícito do SuperAdmin à consulta de reservas', async () => {
    const res = await request(app).get(`${base}/status/97001`).set('Authorization', `Bearer ${token('SuperAdmin', null)}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.status_pagamento).toBe('Pendente');
  });
  it.each(['Cliente', 'Administrador', 'SuperAdmin'])('bloqueia simulador em produção inclusive para %s', async perfil => {
    await seedTransaction();
    vi.stubEnv('NODE_ENV', 'production');
    const res = await request(app).post(`${base}/simular-pagamento`).set('Authorization', `Bearer ${token(perfil)}`)
      .send({ gateway_ref: '970001' });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain('produção');
    await assertUnpaid();
    expect(await db.getAsync("SELECT status FROM TransacoesGateway WHERE gateway_ref = '970001'"))
      .toEqual({ status: 'Pendente' });
    expect(provider).not.toHaveBeenCalled();
  });
  it('permite ao cliente simular somente a própria reserva fora de produção', async () => {
    await seedTransaction();
    const denied = await request(app).post(`${base}/simular-pagamento`).set('Authorization', `Bearer ${otherClient}`)
      .send({ gateway_ref: '970001' });
    expect(denied.statusCode).toBe(403);
    await assertUnpaid();
    const allowed = await request(app).post(`${base}/simular-pagamento`).set('Authorization', `Bearer ${owner}`)
      .send({ gateway_ref: '970001' });
    expect(allowed.statusCode).toBe(200);
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
  });
  it('nega troca OAuth sem autenticação ou para uma arena diferente', async () => {
    expect((await request(app).post(`${base}/oauth/exchange`).send({ code: 'fake', state: 'fake' })).statusCode).toBe(403);
    const { createOAuthState } = require('../src/utils/oauthState');
    const stateOwner = await createOAuthState(97001, 97001);
    const resOther = await request(app).post(`${base}/oauth/exchange`).set('Authorization', `Bearer ${otherAdmin}`)
      .send({ code: 'fake', state: stateOwner });
    expect(resOther.statusCode).toBe(403);
    expect(resOther.body.error).toContain('não pertence à sua arena');

    const resUnissued = await request(app).post(`${base}/oauth/exchange`).set('Authorization', `Bearer ${admin}`)
      .send({ code: 'fake', state: '97001' });
    expect(resUnissued.statusCode).toBe(400);
    expect(resUnissued.body.error).toContain('não emitido pelo sistema');
    expect(provider).not.toHaveBeenCalled();
  });
  it('conecta via OAuth sem retornar a chave privada', async () => {
    const oldConfig = await db.allAsync("SELECT chave, valor FROM ConfiguracoesSaaS WHERE chave IN ('mp_client_id', 'mp_client_secret')");
    try {
      await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES ('mp_client_id', 'TEST-CLIENT'), ('mp_client_secret', 'TEST-SECRET')");
      respond({ access_token: 'TEST-OAUTH-TOKEN', public_key: 'TEST-OAUTH-PUBLIC' });
      const { createOAuthState } = require('../src/utils/oauthState');
      const validState = await createOAuthState(97001, 97001);
      const res = await request(app).post(`${base}/oauth/exchange`).set('Authorization', `Bearer ${admin}`)
        .send({ code: 'test-code', state: validState });
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ gateway_connected: true, publicKey: 'TEST-OAUTH-PUBLIC' });
      expect(res.body).not.toHaveProperty('accessToken');
      expect(JSON.stringify(res.body)).not.toContain('TEST-OAUTH-TOKEN');
      expect(await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id = 97001')).toEqual({ gateway_access_token: 'TEST-OAUTH-TOKEN' });
      expect(await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id = 97002')).toEqual({ gateway_access_token: null });
    } finally {
      await db.runAsync("DELETE FROM ConfiguracoesSaaS WHERE chave IN ('mp_client_id', 'mp_client_secret')");
      for (const row of oldConfig) await db.runAsync('INSERT INTO ConfiguracoesSaaS (chave, valor) VALUES (?, ?)', [row.chave, row.valor]);
    }
  });
  it('impede replay de state e de code no OAuth exchange', async () => {
    const { createOAuthState } = require('../src/utils/oauthState');
    const validState = await createOAuthState(97001, 97001);
    await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES ('mp_client_id', 'TEST-CLIENT'), ('mp_client_secret', 'TEST-SECRET')");
    try {
      respond({ access_token: 'TOKEN-1', public_key: 'PUB-1' });
      const first = await request(app).post(`${base}/oauth/exchange`).set('Authorization', `Bearer ${admin}`)
        .send({ code: 'unique-code-1', state: validState });
      expect(first.statusCode).toBe(200);

      // Replay de state
      const replayState = await request(app).post(`${base}/oauth/exchange`).set('Authorization', `Bearer ${admin}`)
        .send({ code: 'new-code-2', state: validState });
      expect(replayState.statusCode).toBe(400);
      expect(replayState.body.error).toContain('já foi utilizado');

      // Replay de code com novo state
      const state2 = await createOAuthState(97001, 97001);
      const replayCode = await request(app).post(`${base}/oauth/exchange`).set('Authorization', `Bearer ${admin}`)
        .send({ code: 'unique-code-1', state: state2 });
      expect(replayCode.statusCode).toBe(400);
      expect(replayCode.body.error).toContain('já utilizado');
    } finally {
      await db.runAsync("DELETE FROM ConfiguracoesSaaS WHERE chave IN ('mp_client_id', 'mp_client_secret')");
    }
  });
  it('valida state seguro e redireciona no GET /oauth/callback', async () => {
    const { createOAuthState } = require('../src/utils/oauthState');
    const validState = await createOAuthState(97001, 97001);
    await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES ('mp_client_id', 'TEST-CLIENT'), ('mp_client_secret', 'TEST-SECRET')");
    try {
      respond({ access_token: 'TOKEN-CALLBACK', public_key: 'PUB-CALLBACK' });
      const res = await request(app).get(`${base}/oauth/callback?code=code-cb-1&state=${validState}`);
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('/admin/configuracoes?tab=pagamentos&oauth=success');
      expect(res.headers.location).not.toContain('TOKEN-CALLBACK');
      expect(await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id = 97001')).toEqual({ gateway_access_token: 'TOKEN-CALLBACK' });

      // Replay do callback
      const replay = await request(app).get(`${base}/oauth/callback?code=code-cb-2&state=${validState}`);
      expect(replay.statusCode).toBe(302);
      expect(replay.headers.location).toContain('oauth=error');
    } finally {
      await db.runAsync("DELETE FROM ConfiguracoesSaaS WHERE chave IN ('mp_client_id', 'mp_client_secret')");
    }
  });
  it('não expõe a chave privada na consulta geral da arena', async () => {
    // Usa o mesmo router registrado em server.js, sem iniciar cron nem o banco de produção.
    const arenaApp = require('express')();
    arenaApp.use('/api/arenas', require('../src/routes/arenasRoutes'));
    const res = await request(arenaApp).get('/api/arenas/minha').set('Authorization', `Bearer ${admin}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.gateway_connected).toBe(true);
    expect(res.body).not.toHaveProperty('gateway_access_token');
    expect(JSON.stringify(res.body)).not.toContain('TEST-ONLY-NOT-A-REAL-TOKEN');
  });
  it('rejeita serial inválido e preserva a configuração anterior', async () => {
    const res = await request(app).post(`${base}/maquineta`).set('Authorization', `Bearer ${admin}`).send({ gateway_device_id: '123' });
    expect(res.statusCode).toBe(400);
    expect(await db.getAsync('SELECT gateway_device_id FROM Arenas WHERE id = 97001')).toEqual({ gateway_device_id: 'device_test_123' });
  });
  it('envia cobrança para a maquineta da arena e persiste a transação', async () => {
    respond({ id: 970001 });
    const res = await charge('Maquineta', admin);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'pending', gateway_ref: '970001', device_id: 'device_test_123' });
    expect(provider.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/devices/device_test_123/point-integration-api/payment-intents');
    expect(await db.getAsync("SELECT metodo, valor FROM TransacoesGateway WHERE gateway_ref = '970001'"))
      .toEqual({ metodo: 'Maquineta', valor: 100 });
  });
  it.each([
    [{ device_id: 'outro_device', valor_pago: 100 }, 'Terminal de pagamento'],
    [{ device_id: 'device_test_123', valor_pago: 99 }, 'divergente']
  ])('rejeita liquidação divergente (%j) sem alterar saldo', async (payload, message) => {
    await seedTransaction('Maquineta');
    const res = await request(app).post(`${base}/simular-pagamento`).set('Authorization', `Bearer ${admin}`)
      .send({ gateway_ref: '970001', ...payload });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain(message);
    expect(await db.getAsync("SELECT status FROM TransacoesGateway WHERE gateway_ref = '970001'"))
      .toEqual({ status: 'Pendente' });
    await assertUnpaid();
  });
  it('não permite que outra arena liquide a transação pelo simulador', async () => {
    await seedTransaction();
    const res = await request(app).post(`${base}/simular-pagamento`).set('Authorization', `Bearer ${otherAdmin}`).send({ gateway_ref: '970001' });
    expect(res.statusCode).toBe(403);
    await assertUnpaid();
  });
  it('liquida maquineta com dispositivo e valor exatos no simulador de testes', async () => {
    await seedTransaction('Maquineta');
    const res = await request(app).post(`${base}/simular-pagamento`).set('Authorization', `Bearer ${admin}`)
      .send({ gateway_ref: '970001', device_id: 'device_test_123', valor_pago: 100 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'success', reserva_id: 97001 });
    expect(await db.getAsync('SELECT valor, metodo FROM Pagamentos WHERE reserva_id = 97001'))
      .toEqual({ valor: 100, metodo: 'Cartão (Maquineta)' });
    expect(await db.getAsync('SELECT status, status_pagamento FROM Reservas WHERE id = 97001'))
      .toEqual({ status: 'Confirmada', status_pagamento: 'Pago' });
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
  });
  it('rejeita cobrança sem autenticação antes de consultar o provedor', async () => {
    const res = await request(app).post(`${base}/cobranca`).send({ reserva_id: 97001, metodo: 'Pix' });
    expect(res.statusCode).toBe(403);
    expect(provider).not.toHaveBeenCalled();
    await assertUnpaid();
  });
  it.each(['test', 'production'])('confirma webhook aprovado em %s sem duplicar pagamento na repetição sequencial', async environment => {
    vi.stubEnv('NODE_ENV', environment);
    await seedTransaction();
    for (let attempt = 0; attempt < 2; attempt++) {
      respond({ id: 970001, status: 'approved', transaction_amount: 100 });
      const res = await request(app).post(`${base}/webhook`).send({ action: 'payment.updated', data: { id: 970001 } });
      expect(res.statusCode).toBe(200);
    }
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/payments/970001');
    expect(await db.getAsync('SELECT COUNT(*) AS total, SUM(valor) AS valor FROM Pagamentos WHERE reserva_id = 97001'))
      .toEqual({ total: 1, valor: 100 });
    expect(await db.getAsync('SELECT status, status_pagamento FROM Reservas WHERE id = 97001'))
      .toEqual({ status: 'Confirmada', status_pagamento: 'Pago' });
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
    expect(sendEmail.mock.calls[0][0]).toBe('gateway-owner@example.test');
  });
  it('não marca como pago quando o provedor confirma status pendente', async () => {
    await seedTransaction();
    respond({ id: 970001, status: 'pending', transaction_amount: 100 });
    const res = await request(app).post(`${base}/webhook`).send({ action: 'payment.updated', data: { id: 970001 } });
    expect(res.statusCode).toBe(200);
    expect(provider).toHaveBeenCalledTimes(1);
    await assertUnpaid();
  });
  it('preserva Pix direto de arena sem conta de gateway conectada', async () => {
    await db.runAsync("UPDATE Arenas SET gateway_access_token = NULL, chave_pix = 'pix@example.test', titular_pix = 'Arena Teste' WHERE id = 97001");
    const res = await charge();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ is_estatico: true, gateway_ref: 'PIX_ESTATICO_97001' });
    expect(res.body.copia_cola).toContain('pix@example.test');
    expect(provider).not.toHaveBeenCalled();
    await assertUnpaid();
  });
  it('liquida cartão aprovado pelo provedor', async () => {
    respond({ id: 970001, status: 'approved' });
    const res = await charge('Cartão', owner, { card_data: { token: 'fake-card-token', payment_method_id: 'visa' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'approved', gateway_ref: '970001' });
    expect(await db.getAsync('SELECT valor, metodo FROM Pagamentos WHERE reserva_id = 97001'))
      .toEqual({ valor: 100, metodo: 'Cartão de Crédito Online' });
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
  });
  it.each([true, false])('só registra estorno confirmado pelo provedor (aprovado=%s)', async approved => {
    await seedTransaction();
    await db.runAsync("UPDATE TransacoesGateway SET status = 'Pago' WHERE gateway_ref = '970001'");
    respond(approved ? { id: 1 } : { message: 'Estorno recusado no teste' }, approved);
    const result = await estornarPagamentoPix(97001, 97001);
    expect(result.success).toBe(approved);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/payments/970001/refunds');
    expect(await db.getAsync("SELECT status FROM TransacoesGateway WHERE gateway_ref = '970001'"))
      .toEqual({ status: approved ? 'Estornado' : 'Pago' });
  });
});
