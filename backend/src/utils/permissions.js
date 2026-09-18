const { httpError } = require('./security');
const staff = ['Administrador', 'Gerente', 'Recepcionista'];
function assertManagedUser(actor, target, desiredRole) {
  const allowed = actor.perfil === 'Administrador' ? ['Gerente', 'Recepcionista'] : actor.perfil === 'Gerente' ? ['Recepcionista'] : [];
  if (!actor.tenant_id || !allowed.includes(desiredRole) || (target && (Number(target.id) === Number(actor.id) || Number(target.tenant_id) !== Number(actor.tenant_id) || !allowed.includes(target.perfil)))) {
    throw httpError(403, 'Você não pode atribuir esse perfil ou alterar esta conta.');
  }
}
module.exports = { staff, assertManagedUser };
