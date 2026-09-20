const db = require('../config/database');
const { ensureSecuritySchema } = require('../config/securitySchema');
const { hash, secret, production, httpError } = require('../utils/security');
const { authenticate, cookies } = require('./sessionService');
async function membership(user, tenantId, create = false) {
  if (user?.perfil !== 'Cliente') throw httpError(403, 'Operação exclusiva de atleta.');
  await ensureSecuritySchema(db);
  return db.transaction(async()=>{
  let row = await db.getAsync('SELECT c.id,c.tenant_id,c.nome,c.email,c.telefone,c.cpf,c.avatar_url,c.ativo FROM ClientMemberships m JOIN Clientes c ON c.id=m.cliente_id AND c.tenant_id=m.tenant_id WHERE m.usuario_id=? AND m.tenant_id=? AND m.verified=1', [user.id, tenantId]);
  if (row && row.ativo !== 1) throw httpError(403,'Cadastro indisponível nesta arena.');
  if (row || !create) return row;
  const pending = await db.getAsync('SELECT 1 FROM ClientMemberships WHERE usuario_id=? AND tenant_id=? AND verified=0', [user.id, tenantId]);
  if (pending) throw httpError(403, 'Seu vínculo anterior precisa ser verificado pela arena antes de acessar este cadastro.');
  // 3. Create fresh record if none exists
  if (!row) {
    const inserted = await db.runAsync('INSERT INTO Clientes(tenant_id,nome,email) VALUES(?,?,?)', [tenantId, user.nome, user.email]);
    row = await db.getAsync('SELECT id,tenant_id,nome,email,telefone,cpf,avatar_url,ativo FROM Clientes WHERE id=?', [inserted.lastID]);
  }
  await db.runAsync('INSERT INTO ClientMemberships(usuario_id,tenant_id,cliente_id,verified) VALUES(?,?,?,1)', [user.id, tenantId, row.id]);
  return db.getAsync('SELECT c.id,c.tenant_id,c.nome,c.email,c.telefone,c.cpf,c.avatar_url,c.ativo FROM ClientMemberships m JOIN Clientes c ON c.id=m.cliente_id AND c.tenant_id=m.tenant_id WHERE m.usuario_id=? AND m.tenant_id=? AND m.verified=1', [user.id, tenantId]);
  });
}
async function createGuestAccess(tenantId, grupoId, res) {
  await ensureSecuritySchema(db);
  const token = secret();
  await db.runAsync('INSERT INTO GuestAccess(token_hash,tenant_id,grupo_id,expires) VALUES(?,?,?,?)', [hash(token), tenantId, grupoId, Date.now()+86400000]);
  res.cookie('cm_guest', token, { httpOnly: true, secure: production(), sameSite: 'lax', path: '/', maxAge: 86400000 });
  res.cookie('cm_guest_csrf', hash(token + ':csrf'), { secure: production(), sameSite: 'lax', path: '/', maxAge: 86400000 });
}
async function canAccessReservation(req, reserva) {
  await ensureSecuritySchema(db);
  if (req.params.slug) {
    const arena = await db.getAsync('SELECT id FROM Arenas WHERE slug=? AND status=1', [req.params.slug]);
    if (!arena || Number(arena.id) !== Number(reserva.tenant_id)) return false;
  }
  if (cookies(req).cm_session || req.headers.authorization) {
    const user = req.user || await authenticate(req);
    if (await ownsReservation(user,reserva)) return true;
  }
  const token = cookies(req).cm_guest || req.headers['x-reservation-token'];
  if (!token) return false;
  if (cookies(req).cm_guest && !['GET','HEAD','OPTIONS'].includes(req.method) && req.headers['x-guest-csrf'] !== hash(token + ':csrf')) return false;
  return Boolean(await db.getAsync('SELECT 1 FROM GuestAccess WHERE token_hash=? AND tenant_id=? AND grupo_id=? AND expires>?', [hash(token), reserva.tenant_id, reserva.grupo_id, Date.now()]));
}
async function ownsReservation(user,reserva) {
  if(user?.perfil!=='Cliente') return false;
  const client=await membership(user,reserva.tenant_id,false);
  return Boolean(client && Number(client.id)===Number(reserva.cliente_id));
}
async function requireReservationAccess(req, res, next) {
  try {
    const ids = req.params.reserva_id ? [req.params.reserva_id] : req.body.reservas_ids || [req.body.reserva_id];
    if (!Array.isArray(ids) || !ids.length || ids.length > 24) throw httpError(400, 'Reservas inválidas.');
    for (const id of ids) {
      if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw httpError(400, 'Reserva inválida.');
      const reserva = await db.getAsync('SELECT id,tenant_id,cliente_id,grupo_id FROM Reservas WHERE id=?', [id]);
      if (!reserva || !await canAccessReservation(req, reserva)) throw httpError(404, 'Reserva não encontrada.');
    }
    res.set('Cache-Control','no-store');
    next();
  } catch (err) { res.status(err.status || 503).json({ error: require('../utils/security').publicError(err, 'Não foi possível validar o acesso.') }); }
}
module.exports = { membership, ownsReservation, createGuestAccess, canAccessReservation, requireReservationAccess };
