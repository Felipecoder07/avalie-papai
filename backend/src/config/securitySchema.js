const ready = new WeakMap();
function ensureSecuritySchema(db = require('./database')) {
  if (ready.has(db)) return ready.get(db);
  const promise = (async () => {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS SecurityMigrations (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS AuthSessions (token_hash TEXT PRIMARY KEY, csrf_hash TEXT NOT NULL, usuario_id INTEGER NOT NULL, tenant_id INTEGER, password_hash TEXT NOT NULL, perfil TEXT NOT NULL, expires INTEGER NOT NULL, created INTEGER NOT NULL, revoked INTEGER DEFAULT 0)`,
      `CREATE INDEX IF NOT EXISTS auth_sessions_user ON AuthSessions(usuario_id)`,
      `CREATE TABLE IF NOT EXISTS ExternalIdentities (provider TEXT NOT NULL, subject TEXT NOT NULL, usuario_id INTEGER NOT NULL, PRIMARY KEY(provider, subject))`,
      `CREATE TABLE IF NOT EXISTS ClientMemberships (usuario_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL, cliente_id INTEGER NOT NULL, verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(usuario_id, tenant_id), UNIQUE(tenant_id, cliente_id))`,
      `CREATE TABLE IF NOT EXISTS RecoveryChallenges (token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, purpose TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER DEFAULT 0, used INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS BookingContacts (grupo_id TEXT PRIMARY KEY, tenant_id INTEGER NOT NULL, nome TEXT NOT NULL, telefone TEXT, email TEXT, cpf TEXT)`,
      `CREATE TABLE IF NOT EXISTS BookingCancellations (reserva_id INTEGER PRIMARY KEY, reason TEXT NOT NULL, created INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS GuestAccess (token_hash TEXT PRIMARY KEY, tenant_id INTEGER NOT NULL, grupo_id TEXT NOT NULL, expires INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS PaymentIntents (id TEXT PRIMARY KEY, tenant_id INTEGER NOT NULL, reserva_id INTEGER NOT NULL, scope TEXT NOT NULL, method TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), state TEXT NOT NULL DEFAULT 'creating', gateway_ref TEXT, response_json TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS one_open_intent ON PaymentIntents(tenant_id, scope, method) WHERE state IN ('creating','pending','unknown')`,
      `CREATE INDEX IF NOT EXISTS payment_intents_reconciliation ON PaymentIntents(state, updated)`,
      `CREATE TABLE IF NOT EXISTS GatewayCredits (gateway_ref TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL, created INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS PaymentAllocations (gateway_ref TEXT NOT NULL, reserva_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL, PRIMARY KEY(gateway_ref,reserva_id))`,
      `CREATE TABLE IF NOT EXISTS RefundIntents (id TEXT PRIMARY KEY, gateway_ref TEXT NOT NULL, amount_cents INTEGER NOT NULL, state TEXT NOT NULL, response_json TEXT, created INTEGER NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS one_pending_refund ON RefundIntents(gateway_ref) WHERE state IN ('pending','unknown')`,
      `CREATE INDEX IF NOT EXISTS refund_intents_reconciliation ON RefundIntents(state, created)`,
      `CREATE TABLE IF NOT EXISTS SecurityOutbox (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, sent INTEGER DEFAULT 0, created INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS MfaEnrollment(usuario_id INTEGER PRIMARY KEY,secret TEXT NOT NULL,expires INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS MfaRecovery(usuario_id INTEGER NOT NULL,code_hash TEXT NOT NULL,used INTEGER DEFAULT 0,PRIMARY KEY(usuario_id,code_hash))`,
      `CREATE TABLE IF NOT EXISTS SessionMfa(token_hash TEXT PRIMARY KEY,verified_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS SaasPaymentAttempts(invoice_id INTEGER PRIMARY KEY,id TEXT NOT NULL,amount_cents INTEGER NOT NULL,created INTEGER NOT NULL)`,
      `INSERT OR IGNORE INTO SecurityMigrations(version) VALUES (1)`
    ]) await db.runAsync(sql);

    const columns = await db.allAsync('PRAGMA table_info(ClientMemberships)');
    if (!columns.some(column => column.name === 'verified')) {
      await db.runAsync('ALTER TABLE ClientMemberships ADD COLUMN verified INTEGER NOT NULL DEFAULT 0');
    }
    if (!columns.some(column => column.name === 'created_at')) {
      await db.runAsync('ALTER TABLE ClientMemberships ADD COLUMN created_at TEXT');
      await db.runAsync('UPDATE ClientMemberships SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL');
    }
    const userColumns = await db.allAsync('PRAGMA table_info(Usuarios)');
    if (!userColumns.some(column => column.name === 'activation_pending')) {
      await db.runAsync('ALTER TABLE Usuarios ADD COLUMN activation_pending INTEGER NOT NULL DEFAULT 0');
    }
    const arenaColumns = await db.allAsync('PRAGMA table_info(Arenas)');
    if (arenaColumns.length && !arenaColumns.some(column => column.name === 'gateway_user_id')) {
      await db.runAsync('ALTER TABLE Arenas ADD COLUMN gateway_user_id TEXT');
    }
    await require('./migrations/identityCutover').identityCutover(db);
    // Preserve unproven legacy links for reconciliation, never infer ownership from email.
    await db.runAsync('INSERT OR IGNORE INTO SecurityMigrations(version) VALUES (3)');
  })();
  ready.set(db, promise);
  promise.catch(() => ready.delete(db));
  return promise;
}
module.exports = { ensureSecuritySchema };
