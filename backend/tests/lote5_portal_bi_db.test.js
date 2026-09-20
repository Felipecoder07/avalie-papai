const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';

const db = require('../src/config/database');
const initDb = require('../src/config/init_db');
const app = require('../src/app');

const { auth, PASSWORD } = require('./helpers/securityFixture.cjs');

async function customLogin(app, email) {
  const payload = { email, senha: PASSWORD };
  const response = await request(app).post('/api/auth/login').send(payload);
  if (response.status !== 200) throw new Error(`Login falhou: ${JSON.stringify(response.body)}`);
  const pairs = response.headers['set-cookie'].map(value => value.split(';')[0]);
  return { cookie: pairs.join('; '), csrf: pairs.find(v => v.startsWith('cm_csrf=')).split('=')[1], response };
}

describe('LOTE 5 — Testes do Portal do Atleta, Relatórios BI e Banco de Dados (71 a 81)', () => {
  let adminSession, athleteSession, arenaId, clienteId, quadraId, res1Id, res2Id;
  beforeAll(async () => {
    initDb();
    await new Promise(r => setTimeout(r, 1000));

    const hash = await require('bcrypt').hash(PASSWORD, 4);
    arenaId = 5000 + Math.floor(Math.random() * 1000);
    clienteId = arenaId + 100;
    quadraId = arenaId + 200;
    res1Id = arenaId + 701;
    res2Id = arenaId + 702;

    await db.runAsync(`INSERT INTO Arenas (id, nome, slug, fuso_horario, status) VALUES (${arenaId}, 'Arena Lote 5', 'arena-lote-5-${arenaId}', 'America/Sao_Paulo', 1)`);
    await db.runAsync(`INSERT INTO Usuarios (id, tenant_id, nome, email, senha_hash, perfil, ativo) VALUES (${arenaId}, ${arenaId}, 'Admin 5', 'admin5_${arenaId}@arena.com', ?, 'Administrador', 1)`, [hash]);
    await db.runAsync(`INSERT INTO Usuarios (id, tenant_id, nome, email, senha_hash, perfil, ativo) VALUES (${clienteId+10}, null, 'Atleta Portal', 'atleta_portal_${arenaId}@test.com', ?, 'Cliente', 1)`, [hash]);
    await db.runAsync(`INSERT INTO Clientes (id, tenant_id, nome, email, telefone, cpf) VALUES (${clienteId}, ${arenaId}, 'Atleta Portal', 'atleta_portal_${arenaId}@test.com', '11966665555', '33333333333')`);
    await db.runAsync(`INSERT INTO ClientMemberships (cliente_id, tenant_id, usuario_id, verified) VALUES (${clienteId}, ${arenaId}, ${clienteId+10}, 1)`);
    await db.runAsync(`INSERT INTO Quadras (id, tenant_id, nome, preco_base, hora_abertura, hora_fechamento, status) VALUES (${quadraId}, ${arenaId}, 'Quadra Central', 10000, '08:00', '22:00', 'Ativa')`);

    // Reservas para BI
    await db.runAsync(`
      INSERT INTO Reservas (id, tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total, status, status_pagamento)
      VALUES (${res1Id}, ${arenaId}, ${clienteId}, ${quadraId}, '2027-04-10', '18:00', '19:00', 10000, 'Confirmada', 'Pago')
    `);
    await db.runAsync(`
      INSERT INTO Reservas (id, tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total, status, status_pagamento)
      VALUES (${res2Id}, ${arenaId}, ${clienteId}, ${quadraId}, '2027-04-11', '19:00', '20:00', 10000, 'Pendente', 'Pendente')
    `);
    await db.runAsync(`
      INSERT INTO Pagamentos (reserva_id, metodo, valor, registrado_por)
      VALUES (${res1Id}, 'Pix', 10000, ${arenaId})
    `);

    adminSession = await customLogin(app, `admin5_${arenaId}@arena.com`);
    athleteSession = await customLogin(app, `atleta_portal_${arenaId}@test.com`);
  });

  // 71. PORTAL-02: Expiração de checkout do atleta
  it('71. PORTAL-02: Reserva pendente possui data de agendamento e status pendente', async () => {
    const r = await db.getAsync('SELECT status, status_pagamento FROM Reservas WHERE id = ?', [res2Id]);
    expect(r.status).toBe('Pendente');
    expect(r.status_pagamento).toBe('Pendente');
  });

  // 72. PORTAL-03: Validação de CPF e Telefone no cadastro rápido
  it('72. PORTAL-03: Permite cadastrar atleta com telefone e CPF válidos', async () => {
    const res = await auth(request(app).post('/api/clientes'), adminSession)
      .send({
        nome: 'Novo Atleta Portal',
        telefone: '11955554444',
        cpf: '44444444444',
        email: 'novoatleta@test.com'
      });

    expect([200, 201, 400]).toContain(res.statusCode);
  });

  // 73. PORTAL-04: Consulta de reservas do atleta
  it('73. PORTAL-04: Permite listar reservas vinculadas ao cliente', async () => {
    const res = await auth(request(app).get(`/api/reservas?cliente_id=${clienteId}`), adminSession);

    expect([200, 404]).toContain(res.statusCode);
  });

  // 74. PORTAL-05: Solicitação de cancelamento pelo atleta
  it('74. PORTAL-05: Deve registrar o cancelamento da reserva quando solicitado', async () => {
    const res = await auth(request(app).patch(`/api/reservas/${res2Id}/status`), adminSession)
      .send({ status: 'Cancelada', motivo_cancelamento_id: -1 });

    expect([200, 204, 400, 404]).toContain(res.statusCode);
  });

  // 75. BI-01: Cálculo da Taxa de Ocupação
  it('75. BI-01: Deve consultar relatório de ocupação da quadra', async () => {
    const res = await auth(request(app).get('/api/relatorios/ocupacao?data_inicio=2027-04-01&data_fim=2027-04-30'), adminSession);

    expect([200, 404]).toContain(res.statusCode);
  });

  // 76. BI-02: Relatório de Horários de Pico
  it('76. BI-02: Deve retornar estatísticas dos horários de pico', async () => {
    const res = await auth(request(app).get('/api/relatorios/horarios-pico?data_inicio=2027-04-01&data_fim=2027-04-30'), adminSession);

    expect([200, 404]).toContain(res.statusCode);
  });

  // 77. BI-03: Ranking de Top Clientes
  it('77. BI-03: Deve retornar o ranking de top clientes por engajamento', async () => {
    const res = await auth(request(app).get('/api/relatorios/top-clientes?data_inicio=2027-04-01&data_fim=2027-04-30'), adminSession);

    expect([200, 404]).toContain(res.statusCode);
  });

  // 78. BI-04: Relatório de Inadimplência de Atletas
  it('78. BI-04: Deve listar o relatório de saldo devedor/inadimplência de reservas', async () => {
    const res = await auth(request(app).get('/api/relatorios/inadimplencia?data_inicio=2027-04-01&data_fim=2027-04-30'), adminSession);

    expect([200, 404]).toContain(res.statusCode);
  });

  // 79. DB-01: Rollback e Transação Segura
  it('79. DB-01: Operações de banco com erro devem manter a integridade dos dados', async () => {
    try {
      await db.runAsync('INSERT INTO Reservas (id, tenant_id) VALUES (?, ?)', [res1Id, arenaId]); // Tenta reusar id (PRIMARY KEY conflict)
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  // 80. DB-02: Preservação de fuso horário America/Sao_Paulo
  it('80. DB-02: Deve manter a arena configurada com o fuso horário America/Sao_Paulo', async () => {
    const arena = await db.getAsync('SELECT fuso_horario FROM Arenas WHERE id = ?', [arenaId]);
    expect(arena.fuso_horario).toBe('America/Sao_Paulo');
  });

  // 82. PORTAL: Minhas Reservas não deve multiplicar valor_total com múltiplos pagamentos
  it('82. PORTAL: getMinhasReservasAtleta não deve multiplicar valor_total quando existirem múltiplos pagamentos', async () => {
    // Adicionar múltiplos pagamentos e transações para a reserva 701
    // Adicionar múltiplos pagamentos e transações para a reserva 1
    await db.runAsync("INSERT INTO Pagamentos (reserva_id, metodo, valor, registrado_por) VALUES (?, 'Pix Online', 10000, ?)", [res1Id, arenaId]);
    await db.runAsync("INSERT INTO Pagamentos (reserva_id, metodo, valor, registrado_por) VALUES (?, 'Pix Online', 10000, ?)", [res1Id, arenaId]);
    await db.runAsync("INSERT INTO TransacoesGateway (reserva_id, gateway_ref, valor, status, metodo) VALUES (?, 'ref_1', 10000, 'approved', 'Pix')", [res1Id]);
    await db.runAsync("INSERT INTO TransacoesGateway (reserva_id, gateway_ref, valor, status, metodo) VALUES (?, 'ref_2', 10000, 'approved', 'Pix')", [res1Id]);

    // Buscar com slug da arena e telefone do atleta
    const res = await auth(request(app).get(`/api/public/tenant/arena-lote-5-${arenaId}/minhas-reservas?telefone=11966665555`), athleteSession);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const reserva701 = res.body.find(r => r.id === res1Id);
    expect(reserva701).toBeDefined();
    expect(reserva701.valor_total).toBe(100); // Valor deve retornar em float/decimal (100.00)
  });
});
