const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');
const initDb = require('../src/config/init_db');
const { auth, PASSWORD } = require('./helpers/securityFixture.cjs');

process.env.NODE_ENV = 'test';

async function customLogin(app, email) {
  const payload = { email, senha: PASSWORD };
  const response = await request(app).post('/api/auth/login').send(payload);
  if (response.status !== 200) throw new Error(`Login falhou: ${JSON.stringify(response.body)}`);
  const pairs = response.headers['set-cookie'].map(value => value.split(';')[0]);
  return { cookie: pairs.join('; '), csrf: pairs.find(v => v.startsWith('cm_csrf=')).split('=')[1], response };
}

describe('Testes de Integração — Adiantamento de Mensalidades SaaS e Blindagem', () => {
  let adminSession;
  let arenaId;

  beforeAll(async () => {
    initDb();
    await new Promise(r => setTimeout(r, 1000));

    // Garantir planos de teste com nomes e valores consistentes
    await db.runAsync("UPDATE PlanosSaaS SET nome = 'Basic', max_quadras = 3, max_usuarios = 3, valor_mensal = 4999, valor_anual = 3999 WHERE id = 1");
    await db.runAsync("UPDATE PlanosSaaS SET nome = 'Pro', max_quadras = 10, max_usuarios = 10, valor_mensal = 7999, valor_anual = 6399 WHERE id = 2");
    await db.runAsync("UPDATE PlanosSaaS SET nome = 'Enterprise', max_quadras = 999, max_usuarios = 999, valor_mensal = 49990, valor_anual = 39990 WHERE id = 3");
    await db.runAsync("INSERT OR IGNORE INTO PlanosSaaS (id, nome, max_quadras, max_usuarios, valor_mensal, valor_anual) VALUES (1, 'Basic', 3, 3, 4999, 3999)");
    await db.runAsync("INSERT OR IGNORE INTO PlanosSaaS (id, nome, max_quadras, max_usuarios, valor_mensal, valor_anual) VALUES (2, 'Pro', 10, 10, 7999, 6399)");
    await db.runAsync("INSERT OR IGNORE INTO PlanosSaaS (id, nome, max_quadras, max_usuarios, valor_mensal, valor_anual) VALUES (3, 'Enterprise', 999, 999, 49990, 39990)");

    // 1. Criar arena de teste no Plano Basic
    const uniqueSuffix = Date.now() + '_' + Math.floor(Math.random() * 1000);
    const arenaRes = await db.runAsync(`
      INSERT INTO Arenas (nome, slug, email, plano_id, ciclo_cobranca, status, dia_vencimento)
      VALUES (?, ?, ?, 1, 'mensal', 1, 10)
    `, ['Arena Teste Adiantamento', `arena-adiantamento-${uniqueSuffix}`, `adiantamento_${uniqueSuffix}@arena.com`]);
    arenaId = arenaRes.lastID;

    // 2. Criar usuário Administrador
    const hash = await require('bcrypt').hash(PASSWORD, 4);
    const userRes = await db.runAsync(`
      INSERT INTO Usuarios (nome, email, senha_hash, perfil, tenant_id, ativo)
      VALUES (?, ?, ?, 'Administrador', ?, 1)
    `, ['Admin Adiantamento', `admin_${uniqueSuffix}@adiantamento.com`, hash, arenaId]);
    
    adminSession = await customLogin(app, `admin_${uniqueSuffix}@adiantamento.com`);
  });



  it('1. POST /api/tenant/assinatura/adiantar-fatura — Deve gerar fatura antecipada e Pix do plano atual', async () => {
    const res = await auth(request(app).post('/api/tenant/assinatura/adiantar-fatura'), adminSession);

    expect(res.status).toBe(200);
    expect(res.body.fatura_id).toBeDefined();
    expect(res.body.valor).toBe(49.99);
    expect(res.body.plano_nome).toBe('Basic');
    expect(res.body.pix).toBeDefined();

    // Verificar se a fatura foi salva no banco
    const fatura = await db.getAsync('SELECT * FROM FaturasSaaS WHERE id = ?', [res.body.fatura_id]);
    expect(fatura).toBeDefined();
    expect(fatura.status).toBe('Pendente');
  });

  it('2. Idempotência: Chamar /adiantar-fatura novamente deve reutilizar a fatura pendente sem duplicar', async () => {
    const res = await auth(request(app).post('/api/tenant/assinatura/adiantar-fatura'), adminSession);

    expect(res.status).toBe(200);

    const faturas = await db.allAsync('SELECT id FROM FaturasSaaS WHERE tenant_id = ? AND status = "Pendente"', [arenaId]);
    expect(faturas.length).toBe(1);
  });

  it('3. Blindagem de Upgrade: Solicitar troca de plano com fatura antecipada pendente deve atualizar a fatura para o novo plano', async () => {
    const planoPro = await db.getAsync("SELECT id FROM PlanosSaaS WHERE nome = 'Pro'");

    const res = await auth(request(app).post('/api/tenant/assinatura/solicitar-upgrade'), adminSession)
      .send({ plano_id: planoPro.id });

    expect(res.status).toBe(200);
    expect(res.body.valor).toBe(79.99);
    expect(res.body.plano_nome).toBe('Pro');

    // A fatura pendente agora deve ter valor 7999 e plano_id 2
    const fatura = await db.getAsync('SELECT id, valor, plano_id FROM FaturasSaaS WHERE tenant_id = ? AND status = "Pendente"', [arenaId]);
    expect(fatura.valor).toBe(7999);
    expect(fatura.plano_id).toBe(planoPro.id);
  });

  it('4. Simulação de Pagamento — Ao liquidar a fatura antecipada, deve marcar como Paga', async () => {
    const fatura = await db.getAsync('SELECT id, gateway_ref FROM FaturasSaaS WHERE tenant_id = ? AND status = "Pendente"', [arenaId]);
    expect(fatura).toBeDefined();

    const ref = fatura.gateway_ref || `adv_ref_${fatura.id}_${Date.now()}`;
    if (!fatura.gateway_ref) {
      await db.runAsync('UPDATE FaturasSaaS SET gateway_ref = ? WHERE id = ?', [ref, fatura.id]);
    }

    const saasBillingService = require('../src/services/saasBillingService');
    const result = await saasBillingService.liquidarFaturaSaaS(ref);

    expect(result.sucesso).toBe(true);

    const faturaPaga = await db.getAsync('SELECT id, status FROM FaturasSaaS WHERE id = ?', [fatura.id]);
    expect(faturaPaga.status).toBe('Paga');
  });

  it('5. Adiantamento Multi-Mês: Adiantar a 2ª fatura deve gerar vencimento no mês seguinte ao da 1ª fatura', async () => {
    const fatura1 = await db.getAsync('SELECT data_vencimento FROM FaturasSaaS WHERE tenant_id = ? AND status = "Paga" ORDER BY id ASC LIMIT 1', [arenaId]);
    expect(fatura1).toBeDefined();

    const res = await auth(request(app).post('/api/tenant/assinatura/adiantar-fatura'), adminSession);

    expect(res.status).toBe(200);
    expect(res.body.fatura_id).toBeDefined();
    expect(res.body.status_pagamento || res.body.data_vencimento).toBeDefined();
    expect(res.body.competencia).toBeDefined();

    // Validar que a data da 2ª fatura é posterior à da 1ª fatura
    expect(new Date(res.body.data_vencimento).getTime()).toBeGreaterThan(new Date(fatura1.data_vencimento).getTime());
  });

  it('6. Simular Pagamento da 2ª Fatura e Adiantar a 3ª Fatura (+2 meses)', async () => {
    const fatura2 = await db.getAsync('SELECT id, data_vencimento FROM FaturasSaaS WHERE tenant_id = ? AND status = "Pendente"', [arenaId]);
    expect(fatura2).toBeDefined();

    const simRes = await auth(request(app).post(`/api/tenant/assinatura/faturas/${fatura2.id}/simular-pagamento`), adminSession);

    expect(simRes.status).toBe(200);
    expect(simRes.body.pago).toBe(true);

    // Agora gera a 3ª fatura antecipada
    const res3 = await auth(request(app).post('/api/tenant/assinatura/adiantar-fatura'), adminSession);

    expect(res3.status).toBe(200);
    expect(new Date(res3.body.data_vencimento).getTime()).toBeGreaterThan(new Date(fatura2.data_vencimento).getTime());
  });

  it('7. GET /api/tenant/assinatura/plano — Deve calcular vigência, cobertura real e próxima competência', async () => {
    const res = await auth(request(app).get('/api/tenant/assinatura/plano'), adminSession);

    expect(res.status).toBe(200);
    expect(res.body.cobertura_ate).toBeDefined();
    expect(res.body.proximo_vencimento).toBeDefined();
    expect(res.body.proxima_competencia).toBeDefined();
    expect(typeof res.body.meses_adiantados).toBe('number');
  });

  it('8. GET /api/tenant/assinatura/faturas — Deve retornar competências formatadas e flag antecipada', async () => {
    const res = await auth(request(app).get('/api/tenant/assinatura/faturas'), adminSession);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);

    const primeira = res.body[0];
    expect(primeira.competencia).toBeDefined();
    expect(typeof primeira.antecipada).toBe('boolean');
  });
});
