const db = require('../config/database');
const { assertManagedUser, can } = require('../utils/permissions');
const { httpError } = require('../utils/security');

// Recheck both accounts while owning the transaction, so a concurrent transfer
// cannot turn a previously permitted edit into an edit of a superior account.
async function managedWrite(actor, targetId, desiredRole, write) {
  return db.transaction(async () => {
    const current = await db.getAsync('SELECT id,tenant_id,perfil,ativo FROM Usuarios WHERE id=?', [actor.id]);
    if (!current || current.ativo !== 1 || current.tenant_id !== actor.tenant_id || !can(current, 'users.manage')) throw httpError(403, 'Acesso revogado para esta operação.');
    const target = targetId == null ? null : await db.getAsync('SELECT id,tenant_id,perfil FROM Usuarios WHERE id=? AND tenant_id=?', [targetId, actor.tenant_id]);
    if (targetId != null && !target) throw httpError(404, 'Usuário não encontrado.');
    assertManagedUser(current, target, desiredRole || target?.perfil);
    return write(target);
  });
}
module.exports = { managedWrite };
