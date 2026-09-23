const sqlite3 = require('sqlite3').verbose();
const { collectReport, requiresReview } = require('../scripts/report_inconsistencies');
const { applyApprovedBackfill, assertValidReport, planBackfill } = require('../scripts/backfill_data');
const { migrateGlobalReasons } = require('../scripts/migrate_global_reasons');

it('migrates legacy global reasons without breaking reservation references or arena ownership', async () => {
  const db = database();
  try {
    await db.execAsync(`
      CREATE TABLE Arenas(id INTEGER PRIMARY KEY);
      INSERT INTO Arenas VALUES(1);
      CREATE TABLE MotivosCancelamento(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id INTEGER NOT NULL,motivo TEXT NOT NULL,criado_em TEXT,FOREIGN KEY(tenant_id) REFERENCES Arenas(id));
      INSERT INTO MotivosCancelamento VALUES(51,0,'Global','original'),(52,1,'Arena','original');
      CREATE TABLE Reservas(id INTEGER PRIMARY KEY,motivo_cancelamento_id INTEGER REFERENCES MotivosCancelamento(id));
      INSERT INTO Reservas VALUES(110,51);
      PRAGMA foreign_keys=ON;
    `);
    expect(await migrateGlobalReasons(db)).toEqual({ normalized: 1, remainingForeignKeyViolations: 0 });
    expect(await db.allAsync('SELECT id,tenant_id FROM MotivosCancelamento ORDER BY id')).toEqual([{ id: 51, tenant_id: null }, { id: 52, tenant_id: 1 }]);
    expect(await db.allAsync('SELECT * FROM Reservas')).toEqual([{ id: 110, motivo_cancelamento_id: 51 }]);
    expect(await db.allAsync('PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
    expect(await migrateGlobalReasons(db)).toEqual({ normalized: 0, remainingForeignKeyViolations: 0 });
  } finally { await db.closeAsync(); }
});

function database() {
  const db = new sqlite3.Database(':memory:');
  db.allAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
  db.getAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
  db.runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function callback(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
  db.execAsync = sql => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
  db.closeAsync = () => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
  return db;
}

it('flags orphan gateway references even when no payment or group is inconsistent', async () => {
  const db = await fixture();
  try {
    await db.execAsync(`
      DELETE FROM Pagamentos;
      DELETE FROM Usuarios WHERE id IN (1,2);
      DELETE FROM Reservas WHERE id=30;
      CREATE TABLE TransacoesGateway(id INTEGER PRIMARY KEY,reserva_id INTEGER REFERENCES Reservas(id));
      INSERT INTO TransacoesGateway VALUES(35,999);
    `);
    const report = await collectReport(db);
    expect(report.referencias_orfas).toEqual([{ table: 'TransacoesGateway', rowid: 35, parent: 'Reservas', fkid: 0 }]);
    expect(report.grupos_com_saldo_inconsistente).toEqual([]);
    expect(report.pagamentos_sem_reserva).toEqual([]);
    expect(requiresReview(report)).toBe(true);
  } finally { await db.closeAsync(); }
});

async function fixture() {
  const db = database();
  await db.execAsync(`
    CREATE TABLE Usuarios (
      id INTEGER PRIMARY KEY, tenant_id INTEGER, cliente_id INTEGER, nome TEXT,
      email TEXT, perfil TEXT, two_factor_secret TEXT, criado_em TEXT, ativo INTEGER
    );
    CREATE TABLE Clientes (id INTEGER PRIMARY KEY, tenant_id INTEGER);
    CREATE TABLE Quadras (id INTEGER PRIMARY KEY, tenant_id INTEGER);
    CREATE TABLE Reservas (
      id INTEGER PRIMARY KEY, tenant_id INTEGER, cliente_id INTEGER,
      quadra_id INTEGER, grupo_id TEXT, valor_total INTEGER
    );
    CREATE TABLE Pagamentos (
      id INTEGER PRIMARY KEY, reserva_id INTEGER, valor INTEGER,
      metodo TEXT DEFAULT 'Pix', registrado_por INTEGER
    );
    CREATE TABLE LogsAuditoria (
      id INTEGER PRIMARY KEY, tenant_id INTEGER, usuario_id INTEGER,
      evento TEXT, detalhes TEXT
    );

    INSERT INTO Clientes VALUES (1,1),(2,2);
    INSERT INTO Quadras VALUES (1,1),(2,2);
    INSERT INTO Usuarios VALUES
      (1,1,1,'Um',' Repetido@Email.com ','Administrador','123456','2026-09-20',1),
      (2,2,1,'Dois','repetido@email.com','Cliente',NULL,'2026-09-20',1),
      (3,NULL,NULL,'Master','master@example.com','SuperAdmin',NULL,'2026-09-20',1);

    INSERT INTO Reservas VALUES
      (10,1,1,1,'GRUPO-A',10000),
      (11,1,1,1,'GRUPO-A',10000),
      (20,2,2,2,'GRUPO-A',10000),
      (30,1,2,2,NULL,5000);
    INSERT INTO Pagamentos(id,reserva_id,valor) VALUES
      (1,10,12000),
      (2,10,12000),
      (3,20,10000),
      (99,999,500);
  `);
  return db;
}

it('reports overpayment without multiplying reservation totals by the payment join', async () => {
  const db = await fixture();
  try {
    const report = await collectReport(db);

    expect(report.schema_version).toBe(2);
    expect(report.report_id).toMatch(/^[a-f0-9]{64}$/);
    expect(report.duplicidades_usuarios).toHaveLength(1);
    expect(report.pagamentos_sem_reserva).toEqual([{ id: 99, valor: 500, reserva_id: 999 }]);
    expect(report.segredos_padrao).toEqual([{ id: 1, email: ' Repetido@Email.com ', perfil: 'Administrador' }]);
    expect(report.vinculos_entre_arenas.map(item => item.tipo)).toEqual([
      'reserva_cliente',
      'reserva_quadra',
      'usuario_cliente'
    ]);
    expect(report.grupos_com_saldo_inconsistente).toHaveLength(1);
    expect(report.grupos_com_saldo_inconsistente[0]).toMatchObject({
      tenant_id: 1,
      grupo_id: 'GRUPO-A',
      valor_reservas: 20000,
      valor_pago: 24000,
      diferenca: 4000,
      quantidade_reservas: 2,
      acao_recomendada: 'conciliacao_manual'
    });
    expect(report.grupos_com_saldo_inconsistente[0].reservas).toEqual([
      { reserva_id: 10, valor_total: 10000, valor_pago: 24000, quantidade_pagamentos: 2 },
      { reserva_id: 11, valor_total: 10000, valor_pago: 0, quantidade_pagamentos: 0 }
    ]);
  } finally {
    await db.closeAsync();
  }
});

it('plans repeatedly without changing financial history', async () => {
  const db = await fixture();
  try {
    const report = await collectReport(db);
    const before = await db.getAsync('SELECT COUNT(*) AS count, SUM(valor) AS total FROM Pagamentos');

    const first = await planBackfill(db, report);
    const second = await planBackfill(db, report);
    const after = await db.getAsync('SELECT COUNT(*) AS count, SUM(valor) AS total FROM Pagamentos');

    expect(first).toMatchObject({ mode: 'dry_run', database_changes: 0, status: 'manual_review_required' });
    expect(first.reviews[0]).toMatchObject({ status: 'manual_review_required', diferenca: 4000 });
    expect(second.reviews[0]).toMatchObject({ status: 'manual_review_required', diferenca: 4000 });
    expect(first.automatic_actions).toEqual([]);
    expect(after).toEqual(before);
  } finally {
    await db.closeAsync();
  }
});

it('rejects stale and tampered reports instead of applying old values', async () => {
  const db = await fixture();
  try {
    const report = await collectReport(db);
    await db.runAsync('INSERT INTO Pagamentos(id,reserva_id,valor) VALUES (100,10,100)');

    const stalePlan = await planBackfill(db, report);
    expect(stalePlan.reviews[0]).toMatchObject({
      status: 'stale',
      reportado: { diferenca: 4000 },
      atual: { diferenca: 4100 }
    });

    const tampered = JSON.parse(JSON.stringify(report));
    tampered.grupos_com_saldo_inconsistente[0].diferenca = 1;
    expect(() => assertValidReport(tampered)).toThrow(/alterado ou corrompido/);
  } finally {
    await db.closeAsync();
  }
});

it('applies an explicit approved decision exactly once', async () => {
  const db = await fixture();
  try {
    const report = await collectReport(db);
    const approvals = {
      schema_version: 1,
      source_report_id: report.report_id,
      approved_by: 3,
      decisions: [{
        tenant_id: 1,
        grupo_id: 'GRUPO-A',
        reserva_id: 10,
        amount_cents: 4000,
        reason: 'Pagamento duplicado confirmado na conciliacao externa.'
      }]
    };
    const recomputed = [];
    const options = { recomputeReservation: async id => recomputed.push(id) };

    const first = await applyApprovedBackfill(db, report, approvals, options);
    const second = await applyApprovedBackfill(db, report, approvals, options);

    expect(first).toMatchObject({ status: 'applied', database_changes: 1 });
    expect(second).toMatchObject({ status: 'already_applied', database_changes: 0 });
    expect(recomputed).toEqual([10]);
    expect(await db.getAsync(
      "SELECT COUNT(*) AS count, SUM(valor) AS total FROM Pagamentos WHERE metodo = 'Ajuste de Conciliacao Aprovado'"
    )).toEqual({ count: 1, total: -4000 });
    expect((await db.getAsync('SELECT COUNT(*) AS count FROM BackfillApplications')).count).toBe(1);
    expect((await db.getAsync("SELECT COUNT(*) AS count FROM LogsAuditoria WHERE evento='BackfillFinanceiroAprovado'")).count).toBe(1);
  } finally {
    await db.closeAsync();
  }
});
