const db = require('../config/database');
const bcrypt = require('bcrypt');
const { passwordError, httpError } = require('../utils/security');
const { revokeUser } = require('./sessionService');

async function changeOwnPassword(actor, { senha_atual, nova_senha, codigo_2fa }) {
  const error = passwordError(nova_senha);
  if (error) throw httpError(400, error);
  const user = await db.getAsync('SELECT * FROM Usuarios WHERE id=?', [actor.id]);
  if (!user || user.ativo !== 1 || user.activation_pending || user.perfil !== actor.perfil) throw httpError(403, 'Conta indisponível.');
  if (typeof senha_atual !== 'string' || Buffer.byteLength(senha_atual, 'utf8') > 72 || !await bcrypt.compare(senha_atual, user.senha_hash)) throw httpError(403, 'Informe a senha atual.');
  if (user.perfil === 'SuperAdmin' && !require('../utils/totp').verify(user.two_factor_secret, codigo_2fa)) throw httpError(403, 'Segundo fator obrigatório.');
  const encoded = await bcrypt.hash(nova_senha, 12);
  await db.transaction(async () => {
    const updated = await db.runAsync('UPDATE Usuarios SET senha_hash=? WHERE id=? AND senha_hash=? AND perfil=? AND ativo=1 AND activation_pending=0', [encoded, user.id, user.senha_hash, user.perfil]);
    if (updated.changes !== 1) throw httpError(409, 'A conta mudou. Faça login novamente.');
    await db.runAsync('UPDATE RecoveryChallenges SET used=1 WHERE usuario_id=?', [user.id]);
    await revokeUser(user.id);
  });
}
module.exports = { changeOwnPassword };
