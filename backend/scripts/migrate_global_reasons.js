// Run offline, on a dedicated connection. The CLI creates a consistent backup first.
const fs = require('node:fs');
const path = require('node:path');
const sqlite = require('sqlite3');

async function migrateGlobalReasons(db) {
  const columns = await db.allAsync('PRAGMA table_info(MotivosCancelamento)');
  if (columns.map(c => c.name).join(',') !== 'id,tenant_id,motivo,criado_em') {
    throw new Error('Esquema inesperado: revise a migracao antes de executar.');
  }
  const previousFK = (await db.allAsync('PRAGMA foreign_keys'))[0].foreign_keys;
  const beforeFK = await db.allAsync('PRAGMA foreign_key_check');
  const canonical = rows => JSON.stringify(rows.map(row => JSON.stringify(row)).sort());
  const originalRows = await db.allAsync('SELECT * FROM MotivosCancelamento ORDER BY id');
  const expectedRows = originalRows.map(row => ({ ...row, tenant_id: row.tenant_id === 0 ? null : row.tenant_id }));
  await db.runAsync('PRAGMA foreign_keys=OFF');
  try {
    await db.runAsync('BEGIN IMMEDIATE');
    try {
      if (columns.find(c => c.name === 'tenant_id').notnull) {
        const schema = await db.allAsync("SELECT sql FROM sqlite_master WHERE tbl_name='MotivosCancelamento' AND type IN ('index','trigger') AND sql IS NOT NULL");
        const sequence = await db.allAsync("SELECT seq FROM sqlite_sequence WHERE name='MotivosCancelamento'");
        await db.runAsync(`CREATE TABLE MotivosCancelamento_migrating (
          id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER, motivo TEXT NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(tenant_id) REFERENCES Arenas(id))`);
        await db.runAsync(`INSERT INTO MotivosCancelamento_migrating(id,tenant_id,motivo,criado_em)
          SELECT id,NULLIF(tenant_id,0),motivo,criado_em FROM MotivosCancelamento`);
        await db.runAsync('DROP TABLE MotivosCancelamento');
        await db.runAsync('ALTER TABLE MotivosCancelamento_migrating RENAME TO MotivosCancelamento');
        if (sequence.length) await db.runAsync("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='MotivosCancelamento'", [sequence[0].seq]);
        for (const item of schema) await db.runAsync(item.sql);
      } else {
        await db.runAsync('UPDATE MotivosCancelamento SET tenant_id=NULL WHERE tenant_id=0');
      }
      const afterFK = await db.allAsync('PRAGMA foreign_key_check');
      const allowedFK = beforeFK.filter(row => !(row.table === 'MotivosCancelamento' && row.parent === 'Arenas' && originalRows.some(reason => reason.id === row.rowid && reason.tenant_id === 0)));
      if (canonical(afterFK) !== canonical(allowedFK) || canonical(await db.allAsync('SELECT * FROM MotivosCancelamento ORDER BY id')) !== canonical(expectedRows)) {
        throw new Error('Verificacao falhou; migracao revertida.');
      }
      await db.runAsync('COMMIT');
      return { normalized: originalRows.filter(row => row.tenant_id === 0).length, remainingForeignKeyViolations: afterFK.length };
    } catch (error) { await db.runAsync('ROLLBACK'); throw error; }
  } finally { await db.runAsync(`PRAGMA foreign_keys=${previousFK ? 'ON' : 'OFF'}`); }
}

async function main() {
  const [filename, backupFile] = process.argv.slice(2);
  if (!filename || !backupFile || process.argv.length !== 4) throw new Error('Uso: node scripts/migrate_global_reasons.js BANCO_EXISTENTE BACKUP_NOVO');
  const resolved = fs.realpathSync(path.resolve(filename));
  const backup = path.resolve(backupFile);
  if (fs.existsSync(backup)) throw new Error('Backup ja existe.');
  const db = await new Promise((resolve, reject) => {
    const connection = new sqlite.Database(resolved, sqlite.OPEN_READWRITE, error => error ? reject(error) : resolve(connection));
  });
  db.allAsync = (sql, values = []) => new Promise((resolve, reject) => db.all(sql, values, (error, rows) => error ? reject(error) : resolve(rows)));
  db.runAsync = (sql, values = []) => new Promise((resolve, reject) => db.run(sql, values, error => error ? reject(error) : resolve()));
  try {
    await db.runAsync('PRAGMA locking_mode=EXCLUSIVE');
    await db.runAsync('BEGIN EXCLUSIVE');
    await db.runAsync('COMMIT');
    await db.runAsync('VACUUM INTO ?', [backup]);
    fs.chmodSync(backup, 0o600);
    console.log(JSON.stringify(await migrateGlobalReasons(db)));
  } finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
}
if (require.main === module) main().catch(() => { console.error('Migracao nao concluida. Verifique argumentos, esquema e backup; nenhum segredo foi registrado.'); process.exitCode = 1; });
module.exports = { migrateGlobalReasons };
