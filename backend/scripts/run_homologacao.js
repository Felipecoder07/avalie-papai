// Isolated development harness: no cron, no SMTP credentials, no production DB.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const target = path.join(root, '.local-security/homologacao/instance');
const config = JSON.parse(fs.readFileSync(path.join(target, 'config.json')));
assert.equal(config.NODE_ENV, 'development');
assert.ok(config.MERCADO_PAGO_ACCESS_TOKEN?.startsWith('TEST-'));
// Avoid inherited secrets, dotenv from the workspace, and proxy configuration.
for (const name of Object.keys(process.env)) {
  if (!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(name)) delete process.env[name];
}
Object.assign(process.env, config, { NODE_PATH: path.join(root, 'backend/node_modules') });
require('node:module').Module._initPaths();
process.chdir(path.join(target, 'backend'));
assert.equal(fs.existsSync('.env'), false, 'Unexpected dotenv in isolated instance');
// No real credential can be sent by the harness, even if OAuth/config is changed.
const networkFetch = global.fetch;
global.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const authorization = new Headers(options.headers).get('authorization');
  if (url.hostname !== 'api.mercadopago.com' || url.protocol !== 'https:' ||
      authorization !== `Bearer ${config.MERCADO_PAGO_ACCESS_TOKEN}`) {
    throw new Error('Homologation network guard: only the configured TEST credential is allowed.');
  }
  const response = await networkFetch(input, { ...options, redirect: 'error' });
  const body = await response.clone().json().catch(() => ({}));
  const diagnostic = value => typeof value === 'string' ? value
    .replaceAll(config.MERCADO_PAGO_ACCESS_TOKEN, '[redacted]')
    .replace(/\b(?:TEST-|APP_USR-)[a-zA-Z0-9-]+/g, '[redacted]')
    .replace(/[\w.+-]+@[\w.-]+/g, '[email]')
    .replace(/[\r\n]/g, ' ').slice(0, 250) : undefined;
  const evidence = { at: new Date().toISOString(), method: options.method || 'GET', path: url.pathname,
    httpStatus: response.status, liveMode: body.live_mode, amount: body.transaction_amount, currency: body.currency_id,
    error: /^[a-z_]{1,80}$/i.test(body.error || '') ? body.error : undefined,
    message: response.ok ? undefined : diagnostic(body.message),
    causeCodes: Array.isArray(body.cause) ? body.cause.map(item => String(item.code)).filter(code => /^[a-z0-9_]{1,80}$/i.test(code)) : undefined,
    descriptions: response.ok || !Array.isArray(body.cause) ? undefined : body.cause.map(item => diagnostic(item.description)) };
  fs.appendFileSync(path.join(target, 'provider-checks.jsonl'), JSON.stringify(evidence) + '\n');
  return response;
};
const db = require(path.join(target, 'backend/src/config/database'));
async function initialize() {
  const databases = await db.allAsync('PRAGMA database_list');
  assert.equal(path.resolve(databases.find(row => row.name === 'main').file), path.join(target, 'backend/data/courtmanager.sqlite'));
  await new Promise((resolve, reject) => {
    let pending = 0, scheduling = true, firstError;
    const originals = {};
    const finished = () => {
      if (scheduling || pending) return;
      Object.assign(db, originals);
      firstError ? reject(firstError) : resolve();
    };
    for (const method of ['run', 'get', 'all', 'exec']) {
      originals[method] = db[method];
      db[method] = function (...args) {
        const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
        pending++;
        return originals[method].call(this, ...args, function (error, ...values) {
          if (error && !/duplicate column name/i.test(error.message)) firstError ||= error;
          try { callback?.call(this, error, ...values); }
          catch (failure) { firstError ||= failure; }
          finally { pending--; finished(); }
        });
      };
    }
    try { require(path.join(target, 'backend/src/config/init_db'))(); } catch (error) { firstError = error; }
    scheduling = false;
    finished();
  });
  await require(path.join(target, 'backend/src/config/securitySchema')).ensureSecuritySchema(db);
  if (!(await db.getAsync('SELECT COUNT(*) AS count FROM Arenas')).count) {
    const login = JSON.parse(fs.readFileSync(path.join(target, 'login.json')));
    const password = await require('bcrypt').hash(login.password, 12);
    await db.runAsync('BEGIN');
    try {
      for (const id of [1, 2]) {
        await db.runAsync('INSERT INTO Arenas(id,nome,slug,status,notif_reserva_email,notif_cancelamento_email,notif_pagamento_email) VALUES(?,?,?,1,0,0,0)', [id, 'Homologacao ' + id, 'homologacao-' + id]);
        await db.runAsync("INSERT INTO Quadras(id,tenant_id,nome,preco_base,status) VALUES(?,?,?,10000,'Ativa')", [id, id, 'Quadra teste ' + id]);
      }
      await db.runAsync("INSERT INTO Usuarios(tenant_id,nome,email,senha_hash,perfil,ativo) VALUES(1,'Administrador homologacao',?,?,'Administrador',1)", [login.email, password]);
      await db.runAsync("INSERT INTO Clientes(id,tenant_id,nome,email) VALUES(1,1,'Comprador Homologacao','comprador@example.com')");
      await db.runAsync("INSERT INTO Reservas(id,tenant_id,cliente_id,quadra_id,data_reserva,hora_inicio,hora_fim,valor_total,status,status_pagamento,grupo_id) VALUES(1,1,1,1,'2099-12-01','10:00','11:00',10000,'Pendente','Pendente','homologacao-1')");
      await db.runAsync('COMMIT');
    } catch (error) { await db.runAsync('ROLLBACK'); throw error; }
  }
  assert.deepEqual(await db.allAsync('PRAGMA foreign_key_check'), []);
  if (process.argv.includes('--initialize-only')) {
    await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
    console.log('Isolated SQLite initialized; foreign keys OK. No application jobs started.');
    return;
  }
  const app = require(path.join(target, 'backend/src/app'));
  const server = app.listen(Number(config.PORT), '127.0.0.1', () => console.log('Homologation API: http://127.0.0.1:' + config.PORT));
  server.on('error', () => { console.error('Homologation port unavailable.'); process.exit(1); });
}
initialize().catch(error => { console.error('Isolated initialization failed:', error.code || error.name); process.exit(1); });
