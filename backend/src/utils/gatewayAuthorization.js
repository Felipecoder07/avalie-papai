const { can, requirePermission } = require('./permissions');

function validId(value) {
  return (typeof value === 'number' || typeof value === 'string')
    && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

async function assertReservationAccess(user, reserva) {
  if(await require('../services/clientAccessService').ownsReservation(user,reserva)) return;
  const sameArena = validId(user?.tenant_id) && validId(reserva.tenant_id)
    && Number(user.tenant_id) === Number(reserva.tenant_id);
  if (!sameArena || !can(user, 'reservations.manage')) {
    const error = new Error('Acesso negado. Esta reserva não pertence à sua conta ou arena.');
    error.status = 403;
    throw error;
  }
}

module.exports = { assertReservationAccess, requireGatewayManager: requirePermission('gateway.manage') };
