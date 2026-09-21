const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { inspectDatabase } = require('../scripts/inspect_finance_units');

let directory;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-inspection-'));
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

function createDatabase(name, sql) {
  const filename = path.join(directory, name);
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename);
    db.exec(sql, error => {
      if (error) return db.close(() => reject(error));
      db.close(closeError => closeError ? reject(closeError) : resolve(filename));
    });
  });
}

it('accepts a marked cents database without changing the file', async () => {
  const filename = await createDatabase('healthy.sqlite', `
    CREATE TABLE _Migrations(name TEXT, executed_at TEXT);
    INSERT INTO _Migrations VALUES('002_finance_cents.sql','2026-09-20');
    CREATE TABLE FinanceUnitMetadata(key TEXT PRIMARY KEY,value TEXT,applied_at TEXT);
    INSERT INTO FinanceUnitMetadata VALUES('money_unit','cents','2026-09-20');
    CREATE TABLE Quadras(id INTEGER PRIMARY KEY,preco_base INTEGER,modalidades TEXT);
    INSERT INTO Quadras VALUES(1,10000,'[{"nome":"Beach Tennis","preco":10000}]');
  `);
  const before = fs.readFileSync(filename);

  const report = await inspectDatabase(filename);

  expect(report.status).toBe('ok');
  expect(report.mode).toBe('read_only');
  expect(report.modalities.scale_mismatches).toEqual([]);
  expect(report.findings).toEqual([]);
  expect(fs.readFileSync(filename)).toEqual(before);
});

it('flags a legacy migration without marker and a one-hundred-times modality mismatch', async () => {
  const filename = await createDatabase('damaged.sqlite', `
    CREATE TABLE _Migrations(name TEXT, executed_at TEXT);
    INSERT INTO _Migrations VALUES('002_finance_cents.sql','2026-09-20');
    CREATE TABLE Quadras(id INTEGER PRIMARY KEY,preco_base REAL,modalidades TEXT);
    INSERT INTO Quadras VALUES(7,10000,'[{"nome":"Beach Tennis","preco":100}]');
  `);

  const report = await inspectDatabase(filename);
  const codes = report.findings.map(finding => finding.code);

  expect(report.status).toBe('review_required');
  expect(codes).toContain('MIGRATION_WITHOUT_UNIT_MARKER');
  expect(codes).toContain('BASE_MODALITY_SCALE_MISMATCH');
  expect(report.modalities.scale_mismatches).toEqual([
    { quadra_id: 7, preco_base: 10000, modalidade: 'Beach Tennis', preco: 100 }
  ]);
});

it('flags fractional values instead of silently rounding them', async () => {
  const filename = await createDatabase('mixed.sqlite', `
    CREATE TABLE _Migrations(name TEXT, executed_at TEXT);
    INSERT INTO _Migrations VALUES('002_finance_cents.sql','2026-09-20');
    CREATE TABLE FinanceUnitMetadata(key TEXT PRIMARY KEY,value TEXT,applied_at TEXT);
    INSERT INTO FinanceUnitMetadata VALUES('money_unit','cents','2026-09-20');
    CREATE TABLE Pagamentos(id INTEGER PRIMARY KEY,valor REAL);
    INSERT INTO Pagamentos VALUES(1,199.99);
  `);

  const report = await inspectDatabase(filename);

  expect(report.status).toBe('review_required');
  expect(report.findings.map(finding => finding.code)).toContain('FRACTIONAL_CENTS');
});

it('verifies an old unmarked migration against a read-only legacy reference', async () => {
  const reference = await createDatabase('before.sqlite', `
    CREATE TABLE Quadras(id INTEGER PRIMARY KEY,preco_base REAL,modalidades TEXT);
    INSERT INTO Quadras VALUES(1,79.99,'[{"nome":"Vôlei","preco":79.99}]');
    CREATE TABLE Reservas(id INTEGER PRIMARY KEY,valor_total REAL);
    INSERT INTO Reservas VALUES(5,100);
  `);
  const current = await createDatabase('after.sqlite', `
    CREATE TABLE _Migrations(name TEXT, executed_at TEXT);
    INSERT INTO _Migrations VALUES('002_finance_cents.sql','2026-09-20');
    CREATE TABLE Quadras(id INTEGER PRIMARY KEY,preco_base REAL,modalidades TEXT);
    INSERT INTO Quadras VALUES(1,7999,'[{"nome":"Vôlei","preco":7999}]');
    CREATE TABLE Reservas(id INTEGER PRIMARY KEY,valor_total REAL);
    INSERT INTO Reservas VALUES(5,10000);
  `);
  const beforeCurrent = fs.readFileSync(current);
  const beforeReference = fs.readFileSync(reference);

  const report = await inspectDatabase(current, { referencePath: reference });

  expect(report.status).toBe('ok');
  expect(report.legacy_reference_comparison).toMatchObject({
    compared_values: 3,
    exact_x100_values: 3,
    mismatched_values: 0,
    verified: true
  });
  expect(report.findings.map(finding => finding.code)).toEqual(['MIGRATION_VERIFIED_BY_REFERENCE']);
  expect(fs.readFileSync(current)).toEqual(beforeCurrent);
  expect(fs.readFileSync(reference)).toEqual(beforeReference);
});
