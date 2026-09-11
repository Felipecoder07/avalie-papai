const staffProfiles = new Set(['Administrador', 'Gerente', 'Recepcionista', 'Colaborador']);

function validId(value) {
  return (typeof value === 'number' || typeof value === 'string')
    && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function assertReservationAccess(user, reserva) {
  if (user?.perfil === 'SuperAdmin') return;

  const sameArena = validId(user?.tenant_id) && validId(reserva.tenant_id)
    && Number(user.tenant_id) === Number(reserva.tenant_id);
  const isOwner = user?.perfil === 'Cliente' && validId(user.cliente_id)
    && Number(user.cliente_id) === Number(reserva.cliente_id);

  if (!sameArena || (!staffProfiles.has(user?.perfil) && !isOwner)) {
    const error = new Error('Acesso negado. Esta reserva não pertence à sua conta ou arena.');
    error.status = 403;
    throw error;
  }
}

function requireGatewayManager(req, res, next) {
  if (!['Administrador', 'Gerente'].includes(req.user?.perfil) || !validId(req.user?.tenant_id)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores ou gerentes da arena podem configurar pagamentos.' });
  }
  next();
}

module.exports = { assertReservationAccess, requireGatewayManager };
