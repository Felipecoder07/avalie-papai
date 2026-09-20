const { httpError } = require('./security');
const staff = Object.freeze(['Administrador', 'Gerente', 'Recepcionista']);
const managers = Object.freeze(['Administrador', 'Gerente']);
const policy = Object.freeze({
  'staff.read': staff, 'clients.manage': staff, 'reservations.manage': staff,
  'payments.manual': staff, 'payments.read': staff,
  'payments.discount': managers, 'payments.refund': ['Administrador'],
  'users.manage': managers, 'owner.transfer': ['Administrador'],
  'arena.manage': managers, 'courts.manage': managers, 'blocks.manage': managers,
  'gateway.manage': managers, 'gateway.disconnect': ['Administrador'],
  'gateway.reservation': [...staff, 'Cliente'], 'gateway.simulate': staff,
  'reports.read': managers, 'subscription.manage': managers,
  'audit.read': ['Administrador'], 'reasons.manage': ['Administrador'],
  'athlete.self': ['Cliente'], 'master.manage': ['SuperAdmin'],
});
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
function can(user, action) {
  if (!user || !Object.hasOwn(policy, action) || !policy[action].includes(user.perfil)) return false;
  // Master and universal athlete accounts never inherit tenant permissions.
  return ['master.manage', 'athlete.self', 'gateway.reservation'].includes(action)
    ? (user.perfil === 'Cliente' || user.perfil === 'SuperAdmin' || validId(user.tenant_id))
    : validId(user.tenant_id);
}
function requirePermission(action) {
  return (req, res, next) => can(req.user, action)
    ? next() : res.status(403).json({ error: 'Acesso negado para esta operação.' });
}
function assertManagedUser(actor, target, desiredRole) {
  const allowed = actor.perfil === 'Administrador' ? ['Gerente', 'Recepcionista'] : actor.perfil === 'Gerente' ? ['Recepcionista'] : [];
  if (!actor.tenant_id || !allowed.includes(desiredRole) || (target && (Number(target.id) === Number(actor.id) || Number(target.tenant_id) !== Number(actor.tenant_id) || !allowed.includes(target.perfil)))) {
    throw httpError(403, 'Você não pode atribuir esse perfil ou alterar esta conta.');
  }
}
module.exports = { staff, policy, can, requirePermission, assertManagedUser };
