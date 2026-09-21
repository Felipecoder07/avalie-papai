const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { installTransactions } = require('../src/utils/transactions');
const { rotateStoredSecrets } = require('../src/services/secretRotationService');

async function main() {
  const args = process.argv.slice(2);
  const dbIndex = args.indexOf('--db');
  if (dbIndex === -1 || !args[dbIndex + 1] || args.some((arg, i) => i !== dbIndex + 1 && !['--db', '--apply'].includes(arg))) {
    throw new Error('Uso: node scripts/rotate_secrets.js --db CAMINHO_EXISTENTE [--apply]. Padrao: simulacao somente leitura. Injete as chaves pelo ambiente.');
  }
  const filename = fs.realpathSync(path.resolve(args[dbIndex + 1]));
  const apply = args.includes('--apply');
  const db = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(filename, apply ? sqlite3.OPEN_READWRITE : sqlite3.OPEN_READONLY, error => error ? reject(error) : resolve(connection));
  });
  db.configure('busyTimeout', 5000);
  db.allAsync = (sql, values = []) => new Promise((resolve, reject) => db.all(sql, values, (error, rows) => error ? reject(error) : resolve(rows)));
  db.runAsync = (sql, values = []) => new Promise((resolve, reject) => db.run(sql, values, function (error) { error ? reject(error) : resolve(this); }));
  installTransactions(db);
  try {
    console.log(JSON.stringify(await rotateStoredSecrets(db, { apply }), null, 2));
  } finally {
    await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
  }
}

if (require.main === module) main().catch(() => {
  console.error('Rotacao nao concluida. Verifique argumentos, esquema, acesso ao banco e disponibilidade de todas as chaves. Nenhum segredo foi registrado.');
  process.exitCode = 1;
});
