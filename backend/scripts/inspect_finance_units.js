const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();

const DEFAULT_DB = path.resolve(__dirname, '../data/courtmanager.sqlite');
const MONEY_COLUMNS = [
  { table: 'Quadras', column: 'preco_base', reviewAbove: 500000 },
  { table: 'Reservas', column: 'valor_total', reviewAbove: 5000000 },
  { table: 'Pagamentos', column: 'valor', reviewAbove: 5000000 },
  { table: 'TransacoesGateway', column: 'valor', reviewAbove: 5000000 },
  { table: 'PlanosSaaS', column: 'valor_mensal', reviewAbove: 500000 },
  { table: 'PlanosSaaS', column: 'valor_anual', reviewAbove: 5000000 },
  { table: 'FaturasSaaS', column: 'valor', reviewAbove: 5000000 }
];

function openReadOnly(filename) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename, sqlite3.OPEN_READONLY, error => error ? reject(error) : resolve(db));
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
}

function close(db) {
  return new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(identifier)) throw new Error('Identificador SQL inválido.');
  return `"${identifier}"`;
}

async function tableNames(db) {
  const rows = await all(db, "SELECT name FROM sqlite_master WHERE type='table'");
  return new Set(rows.map(row => row.name));
}

async function columnInfo(db, table) {
  return all(db, `PRAGMA table_info(${quoteIdentifier(table)})`);
}

async function inspectMoneyColumn(db, definition, tables) {
  if (!tables.has(definition.table)) return { ...definition, exists: false };
  const columns = await columnInfo(db, definition.table);
  const column = columns.find(item => item.name === definition.column);
  if (!column) return { ...definition, exists: false };
  const table = quoteIdentifier(definition.table);
  const field = quoteIdentifier(definition.column);
  const stats = await get(db, `
    SELECT COUNT(*) AS rows,
           COUNT(${field}) AS populated,
           MIN(${field}) AS minimum,
           MAX(${field}) AS maximum,
           ROUND(AVG(${field}), 2) AS average,
           SUM(CASE WHEN ${field} IS NOT NULL AND ${field} != CAST(${field} AS INTEGER) THEN 1 ELSE 0 END) AS fractional,
           SUM(CASE WHEN ABS(${field}) > ? THEN 1 ELSE 0 END) AS above_review_threshold
    FROM ${table}
  `, [definition.reviewAbove]);
  return { ...definition, exists: true, declared_type: String(column.type || '').toUpperCase(), ...stats };
}

async function inspectModalities(db, tables) {
  if (!tables.has('Quadras')) return { supported: false, reason: 'table_missing' };
  const columns = await columnInfo(db, 'Quadras');
  if (!columns.some(column => column.name === 'modalidades')) return { supported: false, reason: 'column_missing' };
  const invalid = await get(db, `
    SELECT COUNT(*) AS count FROM Quadras
    WHERE modalidades IS NOT NULL AND TRIM(modalidades) NOT IN ('', '[]') AND json_valid(modalidades) = 0
  `);
  const prices = await all(db, `
    SELECT q.id AS quadra_id,
           q.preco_base,
           json_extract(item.value, '$.nome') AS modalidade,
           json_extract(item.value, '$.preco') AS preco
    FROM Quadras q, json_each(q.modalidades) item
    WHERE json_valid(q.modalidades) = 1
      AND item.type = 'object'
      AND json_type(item.value, '$.preco') IN ('integer', 'real')
    ORDER BY q.id
  `);
  const fractional = prices.filter(row => Number(row.preco) !== Math.trunc(Number(row.preco)));
  const scaleMismatches = prices.filter(row => {
    const base = Math.abs(Number(row.preco_base));
    const price = Math.abs(Number(row.preco));
    if (!Number.isFinite(base) || !Number.isFinite(price) || base === 0 || price === 0) return false;
    const ratio = base / price;
    return (ratio >= 95 && ratio <= 105) || (ratio >= 0.0095 && ratio <= 0.0105);
  }).slice(0, 50);
  return {
    supported: true,
    invalid_json: invalid.count,
    priced_modalities: prices.length,
    fractional_prices: fractional.length,
    scale_mismatches: scaleMismatches
  };
}

async function inspectLegacyReference(currentDb, currentTables, referencePath) {
  const resolved = path.resolve(referencePath);
  if (!fs.existsSync(resolved)) throw new Error(`Banco de referência não encontrado: ${resolved}`);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`A referência não é um arquivo: ${resolved}`);

  const comparison = {
    path: resolved,
    bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
    sha256: crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex'),
    expected_multiplier: 100,
    columns: [],
    modalities: null,
    compared_values: 0,
    exact_x100_values: 0,
    mismatched_values: 0,
    verified: false
  };

  const referenceDb = await openReadOnly(resolved);
  try {
    await get(referenceDb, 'PRAGMA query_only = ON');
    const referenceTables = await tableNames(referenceDb);

    for (const definition of MONEY_COLUMNS) {
      if (!currentTables.has(definition.table) || !referenceTables.has(definition.table)) continue;
      const [currentColumns, referenceColumns] = await Promise.all([
        columnInfo(currentDb, definition.table),
        columnInfo(referenceDb, definition.table)
      ]);
      const required = ['id', definition.column];
      if (!required.every(name => currentColumns.some(column => column.name === name)) ||
          !required.every(name => referenceColumns.some(column => column.name === name))) continue;

      const table = quoteIdentifier(definition.table);
      const field = quoteIdentifier(definition.column);
      const [currentRows, referenceRows] = await Promise.all([
        all(currentDb, `SELECT id, ${field} AS value FROM ${table}`),
        all(referenceDb, `SELECT id, ${field} AS value FROM ${table}`)
      ]);
      const currentById = new Map(currentRows.map(row => [String(row.id), row.value]));
      const referenceIds = new Set(referenceRows.map(row => String(row.id)));
      let compared = 0;
      let exact = 0;
      const mismatches = [];
      for (const row of referenceRows) {
        const id = String(row.id);
        if (!currentById.has(id) || row.value === null || currentById.get(id) === null) continue;
        compared += 1;
        const expected = Math.round(Number(row.value) * 100);
        const actual = Number(currentById.get(id));
        if (actual === expected) exact += 1;
        else if (mismatches.length < 50) mismatches.push({ id: row.id, legacy: row.value, expected_cents: expected, actual });
      }
      const mismatched = compared - exact;
      comparison.compared_values += compared;
      comparison.exact_x100_values += exact;
      comparison.mismatched_values += mismatched;
      comparison.columns.push({
        table: definition.table,
        column: definition.column,
        shared_rows: compared,
        exact_x100_rows: exact,
        mismatched_rows: mismatched,
        current_only_rows: currentRows.filter(row => !referenceIds.has(String(row.id))).length,
        reference_only_rows: referenceRows.filter(row => !currentById.has(String(row.id))).length,
        mismatches
      });
    }

    if (currentTables.has('Quadras') && referenceTables.has('Quadras')) {
      const [currentRows, referenceRows] = await Promise.all([
        all(currentDb, 'SELECT id, modalidades FROM Quadras'),
        all(referenceDb, 'SELECT id, modalidades FROM Quadras')
      ]);
      const currentById = new Map(currentRows.map(row => [String(row.id), row.modalidades]));
      let compared = 0;
      let exact = 0;
      const mismatches = [];
      for (const row of referenceRows) {
        const currentJson = currentById.get(String(row.id));
        if (currentJson === undefined) continue;
        let legacyItems;
        let currentItems;
        try {
          legacyItems = JSON.parse(row.modalidades || '[]');
          currentItems = JSON.parse(currentJson || '[]');
        } catch {
          continue;
        }
        if (!Array.isArray(legacyItems) || !Array.isArray(currentItems)) continue;
        for (let index = 0; index < legacyItems.length; index += 1) {
          const legacyPrice = legacyItems[index]?.preco;
          const currentPrice = currentItems[index]?.preco;
          if (!Number.isFinite(Number(legacyPrice)) || !Number.isFinite(Number(currentPrice))) continue;
          compared += 1;
          const expected = Math.round(Number(legacyPrice) * 100);
          if (Number(currentPrice) === expected) exact += 1;
          else if (mismatches.length < 50) {
            mismatches.push({ quadra_id: row.id, index, legacy: legacyPrice, expected_cents: expected, actual: currentPrice });
          }
        }
      }
      const mismatched = compared - exact;
      comparison.compared_values += compared;
      comparison.exact_x100_values += exact;
      comparison.mismatched_values += mismatched;
      comparison.modalities = { compared_prices: compared, exact_x100_prices: exact, mismatched_prices: mismatched, mismatches };
    }

    comparison.verified = comparison.compared_values > 0 && comparison.mismatched_values === 0;
    return comparison;
  } finally {
    await close(referenceDb);
  }
}

async function inspectDatabase(databasePath, options = {}) {
  const resolved = path.resolve(databasePath);
  if (!fs.existsSync(resolved)) throw new Error(`Banco não encontrado: ${resolved}`);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`O caminho não é um arquivo: ${resolved}`);

  const report = {
    generated_at: new Date().toISOString(),
    mode: 'read_only',
    database: {
      path: resolved,
      bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
      sha256: crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex')
    },
    integrity: null,
    migrations: { sql: [], security: [], money_unit: null },
    legacy_reference_comparison: null,
    monetary_columns: [],
    modalities: null,
    findings: [],
    status: 'ok'
  };

  const db = await openReadOnly(resolved);
  try {
    await get(db, 'PRAGMA query_only = ON');
    const quickCheck = await all(db, 'PRAGMA quick_check');
    report.integrity = quickCheck.map(row => Object.values(row)[0]);
    const tables = await tableNames(db);

    if (tables.has('_Migrations')) {
      report.migrations.sql = await all(db, 'SELECT name, executed_at FROM _Migrations ORDER BY name');
    }
    if (tables.has('SecurityMigrations')) {
      report.migrations.security = await all(db, 'SELECT version, applied_at FROM SecurityMigrations ORDER BY version');
    }
    if (tables.has('FinanceUnitMetadata')) {
      report.migrations.money_unit = await get(db, "SELECT value, applied_at FROM FinanceUnitMetadata WHERE key='money_unit'");
    }

    for (const definition of MONEY_COLUMNS) {
      report.monetary_columns.push(await inspectMoneyColumn(db, definition, tables));
    }
    report.modalities = await inspectModalities(db, tables);
    if (options.referencePath) {
      report.legacy_reference_comparison = await inspectLegacyReference(db, tables, options.referencePath);
    }

    if (!report.integrity.every(value => value === 'ok')) {
      report.findings.push({ severity: 'critical', code: 'SQLITE_INTEGRITY', message: 'O PRAGMA quick_check encontrou erro estrutural.' });
    }

    const migration002 = report.migrations.sql.some(row => row.name === '002_finance_cents.sql');
    if (migration002 && report.migrations.money_unit?.value !== 'cents' && report.legacy_reference_comparison?.verified) {
      report.findings.push({
        severity: 'info',
        code: 'MIGRATION_VERIFIED_BY_REFERENCE',
        message: 'A migração 002 antecede o marcador, mas todos os valores compartilhados conferem exatamente com a referência multiplicada por 100.'
      });
    } else if (migration002 && report.migrations.money_unit?.value !== 'cents') {
      report.findings.push({
        severity: 'critical',
        code: 'MIGRATION_WITHOUT_UNIT_MARKER',
        message: 'A migração 002 consta como executada, mas não existe marcador persistente confirmando a unidade em centavos.'
      });
    } else if (!migration002) {
      report.findings.push({ severity: 'warning', code: 'MIGRATION_002_NOT_RECORDED', message: 'A migração monetária 002 não consta em _Migrations.' });
    }

    for (const column of report.monetary_columns.filter(item => item.exists)) {
      if (Number(column.fractional) > 0) {
        report.findings.push({
          severity: 'critical',
          code: 'FRACTIONAL_CENTS',
          message: `${column.table}.${column.column} contém ${column.fractional} valor(es) fracionário(s).`
        });
      }
      if (Number(column.above_review_threshold) > 0) {
        report.findings.push({
          severity: 'warning',
          code: 'MONETARY_OUTLIER',
          message: `${column.table}.${column.column} contém ${column.above_review_threshold} valor(es) acima do limite conservador de revisão.`,
          threshold_cents: column.reviewAbove
        });
      }
      if (column.declared_type === 'REAL' && report.migrations.money_unit?.value === 'cents') {
        report.findings.push({
          severity: 'info',
          code: 'LEGACY_REAL_SCHEMA',
          message: `${column.table}.${column.column} mantém tipo REAL legado, embora o marcador indique centavos.`
        });
      }
    }

    if (report.modalities?.invalid_json > 0) {
      report.findings.push({ severity: 'critical', code: 'INVALID_MODALITIES_JSON', message: `${report.modalities.invalid_json} quadra(s) possuem JSON de modalidades inválido.` });
    }
    if (report.modalities?.fractional_prices > 0) {
      report.findings.push({ severity: 'critical', code: 'FRACTIONAL_MODALITY_PRICE', message: `${report.modalities.fractional_prices} modalidade(s) possuem preço fracionário em centavos.` });
    }
    if (report.modalities?.scale_mismatches?.length > 0) {
      report.findings.push({
        severity: 'critical',
        code: 'BASE_MODALITY_SCALE_MISMATCH',
        message: `${report.modalities.scale_mismatches.length} preço(s) apresentam diferença de escala próxima de 100 vezes entre preço-base e modalidade.`
      });
    }

    if (report.findings.some(finding => finding.severity === 'critical' || finding.severity === 'warning')) {
      report.status = 'review_required';
    }
    return report;
  } finally {
    await close(db);
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const databasePath = argument('--db') || DEFAULT_DB;
  const report = await inspectDatabase(databasePath, { referencePath: argument('--reference') });
  const outputArg = argument('--output');
  const output = outputArg
    ? path.resolve(outputArg)
    : path.resolve(__dirname, '../data/reports', `finance-unit-inspection-${path.basename(databasePath)}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, findings: report.findings.length, report: output }));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { inspectDatabase };
