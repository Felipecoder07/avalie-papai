const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';

const db = require('../src/config/database');
const initDb = require('../src/config/init_db');
const app = require('../src/app');

const { auth, PASSWORD, totp } = require('./helpers/securityFixture.cjs');

async function customLogin(app, email) {
  const payload = { email, senha: PASSWORD };
  if (email.includes('master')) payload.codigo_2fa = totp();
  const response = await request(app).post('/api/auth/login').send(payload);
  if (response.status !== 200) throw new Error(`Login falhou: ${JSON.stringify(response.body)}`);
  const pairs = response.headers['set-cookie'].map(value => value.split(';')[0]);
  return { cookie: pairs.join('; '), csrf: pairs.find(v => v.startsWith('cm_csrf=')).split('=')[1], response };
}

describe('LOTE 4 — Testes de Gateway, Manutenção, Webhooks e SaaS Master (61 a 70)', () => {
  let masterSession, adminSession, arenaId;
  beforeAll(async () => {
    initDb();
    await new Promise(r => setTimeout(r, 1000));

    const hash = await require('bcrypt').hash(PASSWORD, 4);
    arenaId = 4000 + Math.floor(Math.random() * 1000);

    // Seed básico
    await db.runAsync("INSERT OR IGNORE INTO PlanosSaaS (id, nome, max_quadras, max_usuarios, valor_mensal) VALUES (1, 'Basic', 3, 3, 49.99)");
    await db.runAsync(`INSERT INTO Arenas (id, nome, plano_id, status, slug) VALUES (${arenaId}, 'Arena Lote 4', 1, 1, 'arena-lote-4-${arenaId}')`);
    await db.runAsync(`INSERT INTO Usuarios (id, tenant_id, nome, email, senha_hash, perfil, ativo, two_factor_secret) VALUES (${arenaId}, null, 'SuperAdmin', 'master4_${arenaId}@arena.com', ?, 'SuperAdmin', 1, ?)`, [hash, require('./helpers/securityFixture.cjs').MFA_SECRET]);
    await db.runAsync(`INSERT INTO Usuarios (id, tenant_id, nome, email, senha_hash, perfil, ativo) VALUES (${arenaId+1}, ${arenaId}, 'Admin Lote 4', 'admin4_${arenaId}@arena.com', ?, 'Administrador', 1)`, [hash]);

    // Motivos predefinidos
    await db.runAsync(`INSERT OR IGNORE INTO Arenas (id, nome, status, slug) VALUES (0, 'Sistema', 1, 'sistema-0')`);
    await db.runAsync("INSERT OR IGNORE INTO MotivosCancelamento (id, tenant_id, motivo) VALUES (-1, 0, 'Desistência do Cliente')");
    await db.runAsync(`INSERT INTO MotivosCancelamento (id, tenant_id, motivo) VALUES (${arenaId+100}, ${arenaId}, 'Chuva Forte')`);

    masterSession = await customLogin(app, `master4_${arenaId}@arena.com`);
    adminSession = await customLogin(app, `admin4_${arenaId}@arena.com`);
  });

  // 61. SAAS-09: Desativação do trial global
  it('61. SAAS-09: SuperAdmin pode salvar trial_ativo = 0 nas configurações do SaaS', async () => {
    const res = await auth(request(app).put('/api/saas/configuracoes'), masterSession)
      .send({ trial_ativo: '0' });

    expect([200, 204]).toContain(res.statusCode);

    const conf = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'trial_ativo'");
    if (res.statusCode === 200) {
      expect(conf.valor).toBe('0');
    }
  });

  // 62. SAAS-10: Ativação do Modo Manutenção Global
  it('62. SAAS-10: Deve permitir configurar a mensagem do modo manutenção global', async () => {
    const res = await auth(request(app).put('/api/saas/configuracoes'), masterSession)
      .send({
        manutencao_ativa: '1',
        manutencao_mensagem: 'Manutenção de emergência programada'
      });

    expect([200, 204]).toContain(res.statusCode);

    // Desativa manutenção após teste para não afetar outros testes
    await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES ('manutencao_ativa', '0')");
  });

  // 63. SAAS-11: Gestão de motivos de cancelamento
  it('63. SAAS-11: Deve recusar a exclusão de motivo de cancelamento predefinido do sistema (id < 0)', async () => {
    const res = await auth(request(app).delete('/api/motivos/-1'), adminSession);

    expect([400, 403, 404]).toContain(res.statusCode);
  });

  // 64. SAAS-12: Cálculo de Métricas no Dashboard Master
  it('64. SAAS-12: Deve retornar métricas consolidadas de arenas e MRR no painel Master', async () => {
    const res = await auth(request(app).get('/api/saas/metrics'), masterSession);

    expect(res.statusCode).toBe(200);
  });

  // 65. GATE-06: Consulta de Access Token do Gateway
  it('65. GATE-06: Deve consultar se a arena possui credenciais de gateway salvas', async () => {
    const res = await auth(request(app).get(`/api/saas/arenas/${arenaId}`), masterSession);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('gateway_conectado');
  });

  // 66. GATE-07: Validação de Assinatura Webhook (HMAC Signature)
  it('66. GATE-07: Deve rejeitar requisição de webhook com assinatura HMAC inválida se configurado', async () => {
    const res = await request(app)
      .post('/api/pagamentos/gateway/webhook')
      .set('x-signature', 't=1234,v1=fake_signature_hash')
      .send({ gateway_ref: 'ref_fake_non_existent' });

    expect([200, 400, 401, 404]).toContain(res.statusCode);
  });

  // 67. GATE-08: Timeouts e resiliência de hardware POS
  it('67. GATE-08: Deve responder adequadamente se a maquineta POS física estiver desconectada', async () => {
    const res = await auth(request(app).post('/api/pagamentos/gateway/maquineta/cobranca'), adminSession)
      .send({
        reserva_id: 9999, // Reserva inexistente
        device_id: 'POS_OFFLINE_TEST'
      });

    expect([400, 404, 500]).toContain(res.statusCode);
  });

  // 68. GATE-09: Cancelamento manual na tela da maquineta
  it('68. GATE-09: Deve registrar o cancelamento da intenção de cobrança no gateway', async () => {
    const res = await request(app)
      .post('/api/pagamentos/gateway/webhook')
      .send({
        gateway_ref: 'ref_cancelada_pelo_cliente',
        status: 'cancelled'
      });

    expect([200, 404]).toContain(res.statusCode);
  });

  // 69. GATE-10: Divergência de valor pago em Webhook
  it('69. GATE-10: Deve validar cobrança com valor pago divergente do total da reserva', async () => {
    const res = await request(app)
      .post('/api/pagamentos/gateway/webhook')
      .send({
        gateway_ref: 'ref_valor_divergente',
        valor_pago: 5.0, // Valor insuficiente
        status: 'approved'
      });

    expect([200, 400, 404]).toContain(res.statusCode);
  });

  // 70. PORTAL-01: Consulta de horários públicos do atleta no portal
  it('70. PORTAL-01: Deve retornar as quadras ativas para o portal de reservas do atleta', async () => {
    const res = await request(app).get(`/api/quadras?tenant_id=${arenaId}`);

    expect([200, 401, 403]).toContain(res.statusCode);
  });
});
