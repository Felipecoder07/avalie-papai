const crypto = require('node:crypto');
const defaultDb = require('../config/database');

async function ensureOAuthTables(db = defaultDb) {
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS OAuthStates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT UNIQUE NOT NULL,
      tenant_id INTEGER NOT NULL,
      usuario_id INTEGER,
      expira_em DATETIME NOT NULL,
      usado INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES Arenas(id)
    )
  `);

  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS OAuthCodesUsados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      tenant_id INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function createOAuthState(tenantId, usuarioId, ttlMinutes = 15, db = defaultDb) {
  await ensureOAuthTables(db);
  const state = crypto.randomBytes(32).toString('hex');
  const expiraEm = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  await db.runAsync(
    'INSERT INTO OAuthStates (state, tenant_id, usuario_id, expira_em, usado) VALUES (?, ?, ?, ?, 0)',
    [state, tenantId, usuarioId || null, expiraEm]
  );

  return state;
}

async function validateAndConsumeOAuthState(state, expectedTenantId = null, db = defaultDb) {
  await ensureOAuthTables(db);

  if (!state || typeof state !== 'string' || state.trim().length === 0) {
    return { valid: false, status: 400, error: 'Parâmetro de estado OAuth ausente ou inválido.' };
  }

  const cleanState = state.trim();
  const row = await db.getAsync(
    'SELECT id, tenant_id, usuario_id, expira_em, usado FROM OAuthStates WHERE state = ?',
    [cleanState]
  );

  if (!row) {
    return { valid: false, status: 400, error: 'Parâmetro de estado inválido ou não emitido pelo sistema.' };
  }

  if (row.usado) {
    return { valid: false, status: 400, error: 'Este link de autorização já foi utilizado.' };
  }

  if (new Date(row.expira_em) < new Date()) {
    return { valid: false, status: 400, error: 'Autorização expirada. Inicie uma nova conexão.' };
  }

  if (expectedTenantId !== null && Number(row.tenant_id) !== Number(expectedTenantId)) {
    return { valid: false, status: 403, error: 'Acesso negado. A conexão não pertence à sua arena.' };
  }

  // Atualização atômica anti-race condition
  const result = await db.runAsync(
    'UPDATE OAuthStates SET usado = 1 WHERE id = ? AND usado = 0',
    [row.id]
  );

  if (result.changes === 0) {
    return { valid: false, status: 400, error: 'Este link de autorização já foi utilizado.' };
  }

  return {
    valid: true,
    tenant_id: row.tenant_id,
    usuario_id: row.usuario_id
  };
}

async function validateAndConsumeOAuthCode(code, tenantId = null, db = defaultDb) {
  await ensureOAuthTables(db);

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return { valid: false, status: 400, error: 'Código de autorização inválido.' };
  }

  const cleanCode = code.trim();
  const existing = await db.getAsync(
    'SELECT id FROM OAuthCodesUsados WHERE code = ?',
    [cleanCode]
  );

  if (existing) {
    return { valid: false, status: 400, error: 'Código de autorização já utilizado (replay detectado).' };
  }

  try {
    await db.runAsync(
      'INSERT INTO OAuthCodesUsados (code, tenant_id) VALUES (?, ?)',
      [cleanCode, tenantId || null]
    );
  } catch (err) {
    return { valid: false, status: 400, error: 'Código de autorização já utilizado (replay detectado).' };
  }

  return { valid: true };
}

module.exports = {
  ensureOAuthTables,
  createOAuthState,
  validateAndConsumeOAuthState,
  validateAndConsumeOAuthCode
};
