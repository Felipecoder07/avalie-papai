// Installs only the test webhook secret in the isolated database, encrypted.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '../..');
const target = path.join(root, '.local-security/homologacao/instance');
const supplied = dotenv.parse(fs.readFileSync(path.join(root, 'backend/.env.homologacao')));
const config = JSON.parse(fs.readFileSync(path.join(target, 'config.json')));
assert.ok(supplied.MERCADO_PAGO_WEBHOOK_SECRET?.trim(), 'Test webhook secret has not been saved yet.');
assert.equal(supplied.MERCADO_PAGO_ACCESS_TOKEN, config.MERCADO_PAGO_ACCESS_TOKEN);
for (const key of ['SECRETS_KEYRING_FILE', 'SECRETS_ENCRYPTION_KEY', 'VITEST', 'TEST_DB_PATH']) delete process.env[key];
Object.assign(process.env, config, { NODE_PATH: path.join(root, 'backend/node_modules') });
require('node:module').Module._initPaths();
const db = require(path.join(target, 'backend/src/config/database'));
async function main() {
  try {
    const rows = await db.allAsync('PRAGMA database_list');
    assert.equal(path.resolve(rows.find(row => row.name === 'main').file), path.join(target, 'backend/data/courtmanager.sqlite'));
    const { encrypt } = require(path.join(target, 'backend/src/utils/security'));
    await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS(chave,valor) VALUES('mp_webhook_secret',?)", [encrypt(supplied.MERCADO_PAGO_WEBHOOK_SECRET.trim())]);
    console.log('Test webhook secret installed encrypted in isolated database only.');
  } finally { await new Promise(resolve => db.close(resolve)); }
}
main().catch(error => { console.error('Isolated webhook configuration failed:', error.code || error.name); process.exitCode = 1; });
