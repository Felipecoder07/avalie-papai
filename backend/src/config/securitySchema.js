const ready = new WeakMap();
function ensureSecuritySchema(db = require('./database')) {
  if (ready.has(db)) return ready.get(db);
  const promise = (async () => {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS SecurityMigrations (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS AuthSessions (token_hash TEXT PRIMARY KEY, csrf_hash TEXT NOT NULL, usuario_id INTEGER NOT NULL, tenant_id INTEGER, password_hash TEXT NOT NULL, perfil TEXT NOT NULL, expires INTEGER NOT NULL, created INTEGER NOT NULL, revoked INTEGER DEFAULT 0)`,
      `CREATE INDEX IF NOT EXISTS auth_sessions_user ON AuthSessions(usuario_id)`,
      `CREATE TABLE IF NOT EXISTS ExternalIdentities (provider TEXT NOT NULL, subject TEXT NOT NULL, usuario_id INTEGER NOT NULL, PRIMARY KEY(provider, subject))`,
      `CREATE TABLE IF NOT EXISTS ClientMemberships (usuario_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL, cliente_id INTEGER NOT NULL, PRIMARY KEY(usuario_id, tenant_id), UNIQUE(tenant_id, cliente_id))`,
      `CREATE TABLE IF NOT EXISTS RecoveryChallenges (token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, purpose TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER DEFAULT 0, used INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS GuestAccess (token_hash TEXT PRIMARY KEY, tenant_id INTEGER NOT NULL, grupo_id TEXT NOT NULL, expires INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS PaymentIntents (id TEXT PRIMARY KEY, tenant_id INTEGER NOT NULL, reserva_id INTEGER NOT NULL, scope TEXT NOT NULL, method TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), state TEXT NOT NULL DEFAULT 'creating', gateway_ref TEXT, response_json TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS one_open_intent ON PaymentIntents(tenant_id, scope, method) WHERE state IN ('creating','pending','unknown')`,
      `CREATE TABLE IF NOT EXISTS GatewayCredits (gateway_ref TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL, created INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS PaymentAllocations (gateway_ref TEXT NOT NULL, reserva_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL, PRIMARY KEY(gateway_ref,reserva_id))`,
      `CREATE TABLE IF NOT EXISTS RefundIntents (id TEXT PRIMARY KEY, gateway_ref TEXT NOT NULL, amount_cents INTEGER NOT NULL, state TEXT NOT NULL, response_json TEXT, created INTEGER NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS one_pending_refund ON RefundIntents(gateway_ref) WHERE state IN ('pending','unknown')`,
      `CREATE TABLE IF NOT EXISTS SecurityOutbox (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, sent INTEGER DEFAULT 0, created INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS MfaEnrollment(usuario_id INTEGER PRIMARY KEY,secret TEXT NOT NULL,expires INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS MfaRecovery(usuario_id INTEGER NOT NULL,code_hash TEXT NOT NULL,used INTEGER DEFAULT 0,PRIMARY KEY(usuario_id,code_hash))`,
      `CREATE TABLE IF NOT EXISTS SessionMfa(token_hash TEXT PRIMARY KEY,verified_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS SaasPaymentAttempts(invoice_id INTEGER PRIMARY KEY,id TEXT NOT NULL,amount_cents INTEGER NOT NULL,created INTEGER NOT NULL)`,
      `INSERT OR IGNORE INTO SecurityMigrations(version) VALUES (1)`
    ]) await db.runAsync(sql);

    // Migration v2: Conciliar vínculos legados e limpar clientes vazios duplicados
    const m2 = await db.getAsync('SELECT version FROM SecurityMigrations WHERE version = 2');
    if (!m2) {
      try {
        const phantom = await db.getAsync("SELECT id FROM Clientes WHERE id = 26 AND (SELECT COUNT(*) FROM Reservas WHERE cliente_id = 26) = 0");
        if (phantom) {
          await db.runAsync('DELETE FROM ClientMemberships WHERE cliente_id = 26');
          await db.runAsync('DELETE FROM Clientes WHERE id = 26');
        }
        const users = await db.allAsync("SELECT id, email FROM Usuarios WHERE perfil = 'Cliente'");
        for (const u of (users || [])) {
          if (!u.email) continue;
          const candidates = await db.allAsync(
            `SELECT id, tenant_id FROM Clientes 
             WHERE LOWER(email) = LOWER(?)
               AND id NOT IN (SELECT cliente_id FROM ClientMemberships WHERE usuario_id != ?)
             ORDER BY (SELECT COUNT(*) FROM Reservas WHERE cliente_id = Clientes.id) DESC, id ASC`,
            [u.email.trim(), u.id]
          );
          for (const c of candidates) {
            await db.runAsync(
              'INSERT OR REPLACE INTO ClientMemberships (usuario_id, tenant_id, cliente_id) VALUES (?, ?, ?)',
              [u.id, c.tenant_id, c.id]
            );
          }
        }
        await db.runAsync('INSERT OR IGNORE INTO SecurityMigrations(version) VALUES (2)');
      } catch (eMigration) {
        console.warn('[Security Schema Migration v2 Warning]', eMigration.message);
      }
    }
  })();
  ready.set(db, promise);
  promise.catch(() => ready.delete(db));
  return promise;
}
module.exports = { ensureSecuritySchema };
