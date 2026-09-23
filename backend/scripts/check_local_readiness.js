// Read-only local evidence. Does not start the application, run jobs or call providers.
const fs = require('node:fs');
const path = require('node:path');
const sqlite = require('sqlite3');
const dotenv = require('dotenv');
const { collectReport, requiresReview } = require('./report_inconsistencies');
const { rotateStoredSecrets } = require('../src/services/secretRotationService');

async function main() {
  const backend = path.resolve(__dirname, '..');
  const envFile = path.join(backend, '.env');
  const configured = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
  for (const [key, value] of Object.entries(configured)) if (process.env[key] === undefined) process.env[key] = value;
  const filename = fs.realpathSync(path.join(backend, 'data/courtmanager.sqlite'));
  const db = await new Promise((resolve, reject) => {
    const connection = new sqlite.Database(filename, sqlite.OPEN_READONLY, error => error ? reject(error) : resolve(connection));
  });
  db.allAsync = (sql, values = []) => new Promise((resolve, reject) => db.all(sql, values, (error, rows) => error ? reject(error) : resolve(rows)));
  try {
    const integrity = await db.allAsync('PRAGMA integrity_check');
    const inconsistencies = await collectReport(db);
    let encryption;
    try {
      const result = await rotateStoredSecrets(db);
      encryption = { readable: true, scanned: result.scanned, pendingMigration: result.changed };
    } catch {
      encryption = { readable: false, pendingMigration: null };
    }
    const queues = {};
    for (const [table, date] of [['PaymentIntents', 'updated'], ['RefundIntents', 'created']]) {
      queues[table] = await db.allAsync(`SELECT state,COUNT(*) AS count,MIN(${date}) AS oldest FROM ${table} GROUP BY state`);
    }
    queues.SecurityOutbox = await db.allAsync('SELECT sent,COUNT(*) AS count,MIN(created) AS oldest FROM SecurityOutbox GROUP BY sent');
    const required = ['JWT_SECRET', 'FRONTEND_URL', 'CORS_ALLOWED_ORIGINS', 'TRUST_PROXY'];
    const missingProductionVariables = required.filter(key => !process.env[key]);
    const report = {
      checkedAt: new Date().toISOString(), mode: 'read_only_no_network',
      databaseIntegrity: integrity.length === 1 && integrity[0].integrity_check === 'ok',
      reviewRequired: requiresReview(inconsistencies),
      counts: Object.fromEntries(Object.entries(inconsistencies).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])),
      encryption, queues,
      configuration: { productionMode: process.env.NODE_ENV === 'production', missingProductionVariables },
      externalValidation: 'pending', deploymentValidation: 'pending', productionApproved: false,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.databaseIntegrity || report.reviewRequired || !encryption.readable || encryption.pendingMigration) process.exitCode = 1;
    // Production configuration is deliberately deferred; success means local data
    // checks passed, never that production is approved or queues are healthy.
  } finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
}
main().catch(() => { console.error('Verificacao local nao concluida. Confira acesso, esquema e configuracao; nenhum segredo foi registrado.'); process.exitCode = 1; });
