const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();

const migration = fs.readFileSync(
  path.join(__dirname, '../src/config/migrations/002_finance_cents.sql'),
  'utf8'
);

function database() {
  const db = new sqlite3.Database(':memory:');
  return {
    exec: sql => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve())),
    get: (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row))),
    close: () => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()))
  };
}

function schema(type) {
  return `
    CREATE TABLE Quadras (preco_base ${type}, modalidades TEXT);
    CREATE TABLE Reservas (valor_total ${type});
    CREATE TABLE Pagamentos (valor ${type});
    CREATE TABLE TransacoesGateway (valor ${type});
    CREATE TABLE PlanosSaaS (valor_mensal ${type}, valor_anual ${type});
    CREATE TABLE FaturasSaaS (valor ${type});
  `;
}

async function values(db) {
  return {
    quadra: await db.get('SELECT preco_base, modalidades FROM Quadras'),
    reserva: await db.get('SELECT valor_total FROM Reservas'),
    pagamento: await db.get('SELECT valor FROM Pagamentos'),
    transacao: await db.get('SELECT valor FROM TransacoesGateway'),
    plano: await db.get('SELECT valor_mensal, valor_anual FROM PlanosSaaS'),
    fatura: await db.get('SELECT valor FROM FaturasSaaS'),
    marker: await db.get("SELECT value FROM FinanceUnitMetadata WHERE key='money_unit'")
  };
}

it('converte um banco legado em reais exatamente uma vez', async () => {
  const db = database();
  try {
    await db.exec(schema('REAL'));
    await db.exec(`
      INSERT INTO Quadras VALUES (100, '[{"nome":"Geral","preco":100}]');
      INSERT INTO Quadras VALUES (100, '["Beach Tennis","Volei"]');
      INSERT INTO Reservas VALUES (100);
      INSERT INTO Pagamentos VALUES (40);
      INSERT INTO TransacoesGateway VALUES (100);
      INSERT INTO PlanosSaaS VALUES (49.99, 39.99);
      INSERT INTO FaturasSaaS VALUES (49.99);
    `);
    await db.exec(migration);
    await db.exec(migration);

    const result = await values(db);
    expect(result.quadra.preco_base).toBe(10000);
    expect(JSON.parse(result.quadra.modalidades)[0].preco).toBe(10000);
    expect(JSON.parse((await db.get('SELECT modalidades FROM Quadras WHERE rowid=2')).modalidades)).toEqual(['Beach Tennis', 'Volei']);
    expect(result.reserva.valor_total).toBe(10000);
    expect(result.pagamento.valor).toBe(4000);
    expect(result.transacao.valor).toBe(10000);
    expect(result.plano).toEqual({ valor_mensal: 4999, valor_anual: 3999 });
    expect(result.fatura.valor).toBe(4999);
    expect(result.marker.value).toBe('cents');
  } finally {
    await db.close();
  }
});

it('preserva um banco novo que ja armazena centavos', async () => {
  const db = database();
  try {
    await db.exec(schema('INTEGER'));
    await db.exec(`
      INSERT INTO Quadras VALUES (10000, '[{"nome":"Geral","preco":10000}]');
      INSERT INTO Reservas VALUES (10000);
      INSERT INTO Pagamentos VALUES (4000);
      INSERT INTO TransacoesGateway VALUES (10000);
      INSERT INTO PlanosSaaS VALUES (4999, 3999);
      INSERT INTO FaturasSaaS VALUES (4999);
    `);
    await db.exec(migration);
    await db.exec(migration);

    const result = await values(db);
    expect(result.quadra.preco_base).toBe(10000);
    expect(JSON.parse(result.quadra.modalidades)[0].preco).toBe(10000);
    expect(result.reserva.valor_total).toBe(10000);
    expect(result.pagamento.valor).toBe(4000);
    expect(result.transacao.valor).toBe(10000);
    expect(result.plano).toEqual({ valor_mensal: 4999, valor_anual: 3999 });
    expect(result.fatura.valor).toBe(4999);
    expect(result.marker.value).toBe('cents');
  } finally {
    await db.close();
  }
});

it('preserva um banco REAL ja convertido pela versao antiga da migracao', async () => {
  const db = database();
  try {
    await db.exec(schema('REAL'));
    await db.exec(`
      CREATE TABLE _Migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO _Migrations(name) VALUES ('002_finance_cents.sql');
      INSERT INTO Quadras VALUES (10000, '[{"nome":"Geral","preco":10000}]');
      INSERT INTO Reservas VALUES (10000);
      INSERT INTO Pagamentos VALUES (4000);
      INSERT INTO TransacoesGateway VALUES (10000);
      INSERT INTO PlanosSaaS VALUES (4999, 3999);
      INSERT INTO FaturasSaaS VALUES (4999);
    `);

    await db.exec(migration);
    await db.exec(migration);

    const result = await values(db);
    expect(result.quadra.preco_base).toBe(10000);
    expect(JSON.parse(result.quadra.modalidades)[0].preco).toBe(10000);
    expect(result.reserva.valor_total).toBe(10000);
    expect(result.pagamento.valor).toBe(4000);
    expect(result.transacao.valor).toBe(10000);
    expect(result.plano).toEqual({ valor_mensal: 4999, valor_anual: 3999 });
    expect(result.fatura.valor).toBe(4999);
    expect(result.marker.value).toBe('cents');
  } finally {
    await db.close();
  }
});
