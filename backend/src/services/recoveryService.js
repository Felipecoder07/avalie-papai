const db = require('../config/database');
const bcrypt = require('bcrypt');
const { ensureSecuritySchema } = require('../config/securitySchema');
const { hash, secret, passwordError, httpError } = require('../utils/security');
const { revokeUser } = require('./sessionService');
async function createChallenge(userId, purpose = 'password', code = secret(), ttl = 3600000) {
  await ensureSecuritySchema(db);
  await db.runAsync('UPDATE RecoveryChallenges SET used=1 WHERE usuario_id=? AND purpose=?', [userId, purpose]);
  await db.runAsync('INSERT INTO RecoveryChallenges(token_hash,usuario_id,purpose,expires) VALUES(?,?,?,?)', [hash(userId + ':' + purpose + ':' + code), userId, purpose, Date.now()+ttl]);
  return code;
}
async function resetWithChallenge(userId, purpose, code, password) {
  if (passwordError(password)) throw httpError(400, passwordError(password));
  await ensureSecuritySchema(db);
  const tokenHash = hash(userId + ':' + purpose + ':' + code);
  // Increment attempts even for wrong guesses; the upper bound survives IP rotation.
  await db.runAsync('UPDATE RecoveryChallenges SET attempts=attempts+1 WHERE usuario_id=? AND purpose=? AND used=0', [userId,purpose]);
  const encoded = await bcrypt.hash(password, 12);
  await db.transaction(async () => {
  const consumed = await db.runAsync('UPDATE RecoveryChallenges SET used=1 WHERE token_hash=? AND usuario_id=? AND purpose=? AND used=0 AND attempts<=5 AND expires>?', [tokenHash,userId,purpose,Date.now()]);
  if (consumed.changes !== 1) throw httpError(400, 'Código inválido ou expirado.');
  await db.runAsync('UPDATE Usuarios SET senha_hash=?, reset_password_token=NULL, reset_password_expires=NULL WHERE id=?', [encoded,userId]);
  await revokeUser(userId);
  });
}
module.exports = { createChallenge, resetWithChallenge };
