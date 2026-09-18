const db = require('../config/database');
const { ensureSecuritySchema } = require('../config/securitySchema');
const { hash, secret, httpError, production } = require('../utils/security');
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim().split('=')).filter(v => v.length === 2));
}
async function issueSession(user, req, res) {
  await ensureSecuritySchema(db);
  const current = await db.getAsync('SELECT * FROM Usuarios WHERE id = ?', [user.id]);
  if (!current || current.ativo === 0) throw httpError(401, 'Conta indisponível.');
  const token = secret(), csrf = secret();
  const maxAge = (current.perfil === 'Cliente' ? 7 * 24 : 8) * 3600000;
  await db.runAsync('INSERT INTO AuthSessions(token_hash,csrf_hash,usuario_id,tenant_id,password_hash,perfil,expires,created) VALUES(?,?,?,?,?,?,?,?)',
    [hash(token), hash(csrf), current.id, current.tenant_id, hash(current.senha_hash), current.perfil, Date.now() + maxAge, Date.now()]);
  if(current.perfil==='SuperAdmin' && require('../utils/totp').verify(current.two_factor_secret,req.body?.codigo_2fa)) await db.runAsync('INSERT INTO SessionMfa(token_hash,verified_at) VALUES(?,?)',[hash(token),Date.now()]);
  res.cookie('cm_session', token, { httpOnly: true, secure: production(), sameSite: 'lax', path: '/', maxAge });
  res.cookie('cm_csrf', csrf, { secure: production(), sameSite: 'lax', path: '/', maxAge });
  // Compatibility marker for interface state; it is NOT an authentication credential.
  return 'session';
}
async function authenticate(req) {
  await ensureSecuritySchema(db);
  const cookie = cookies(req);
  const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
  const token = cookie.cm_session || bearer?.[1];
  if (!token) throw httpError(401, 'Sessão não fornecida. Faça login novamente.');
  const session = await db.getAsync('SELECT * FROM AuthSessions WHERE token_hash = ? AND revoked = 0 AND expires > ?', [hash(token), Date.now()]);
  if (!session) throw httpError(401, 'Sessão expirada ou revogada.');
  const user = await db.getAsync('SELECT id,nome,email,perfil,tenant_id,cliente_id,ativo,senha_hash FROM Usuarios WHERE id = ?', [session.usuario_id]);
  if (!user || user.ativo === 0 || hash(user.senha_hash) !== session.password_hash || user.perfil !== session.perfil || user.tenant_id !== session.tenant_id) throw httpError(401, 'Sessão revogada. Faça login novamente.');
  if (cookie.cm_session && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (hash(req.headers['x-csrf-token'] || '') !== session.csrf_hash) throw httpError(403, 'Verificação de segurança inválida. Atualize a página.');
  }
  delete user.senha_hash;
  req.authSession = session;
  return user;
}
async function revokeUser(id) {
  await ensureSecuritySchema(db);
  await db.runAsync('UPDATE AuthSessions SET revoked = 1 WHERE usuario_id = ?', [id]);
}
async function logout(req, res) {
  if (req.authSession) await db.runAsync('UPDATE AuthSessions SET revoked = 1 WHERE token_hash = ?', [req.authSession.token_hash]);
  res.clearCookie('cm_session', { path: '/' });
  res.clearCookie('cm_csrf', { path: '/' });
}
module.exports = { issueSession, authenticate, revokeUser, logout, cookies };
