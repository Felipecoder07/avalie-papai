const { loadKeys, encrypt, decrypt } = require('../utils/secretEncryption');

const columns = [
  { table: 'Arenas', key: 'id', column: 'gateway_access_token' },
  { table: 'Usuarios', key: 'id', column: 'two_factor_secret' },
  { table: 'MfaEnrollment', key: 'usuario_id', column: 'secret' },
  { table: 'ConfiguracoesSaaS', key: 'chave', column: 'valor', filter: " AND chave IN ('mp_client_secret','mp_master_access_token','mp_webhook_secret')" },
];

async function rotateStoredSecrets(db, { apply = false } = {}) {
  const { activeId } = loadKeys({ requireActive: true });
  const work = async () => {
    const report = { applied: apply, activeKeyId: activeId, scanned: 0, changed: 0, alreadyCurrent: 0, tables: {} };
    for (const { table, key, column, filter = '' } of columns) {
      const schema = await db.allAsync(`PRAGMA table_info(${table})`);
      if (!schema.some(field => field.name === column)) {
        // MFA enrollment may not exist on a pre-cutover snapshot.
        if (table === 'MfaEnrollment') continue;
        throw new Error('Esquema de segredos incompleto. Execute as migracoes estruturais primeiro.');
      }
      const rows = await db.allAsync(`SELECT ${key} AS row_id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''${filter}`);
      let changed = 0;
      for (const row of rows) {
        // Validate even current ciphertext: corruption/missing keys must abort
        // the entire rotation rather than leave a partially migrated database.
        const plain = decrypt(row.value, { allowPlaintext: true });
        report.scanned++;
        if (row.value.startsWith(`enc:v2:${activeId}:`)) {
          report.alreadyCurrent++;
          continue;
        }
        if (apply) {
          const value = encrypt(plain);
          if (decrypt(value) !== plain) throw new Error('Falha de verificacao da rotacao.');
          const result = await db.runAsync(`UPDATE ${table} SET ${column}=? WHERE ${key}=? AND ${column}=?`, [value, row.row_id, row.value]);
          if (result.changes !== 1) throw new Error('Segredo alterado durante a rotacao.');
        }
        changed++;
        report.changed++;
      }
      report.tables[table] = { scanned: rows.length, changed };
    }
    return report;
  };
  // Dry run is read-only. Apply owns the connection and rolls back on any error.
  return apply ? db.transaction(work) : work();
}

module.exports = { rotateStoredSecrets };
