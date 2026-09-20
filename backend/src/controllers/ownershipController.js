const db = require('../config/database');
const { reauthenticate } = require('../middlewares/reauthenticate');
const { revokeUser } = require('../services/sessionService');
const { httpError } = require('../utils/security');

exports.transfer = async (req, res) => {
  try {
    const targetId = Number(req.body?.usuario_id);
    if (!Number.isSafeInteger(targetId) || targetId <= 0 || targetId === req.user.id) throw httpError(400, 'Selecione outro integrante da equipe.');
    await db.transaction(async () => {
      await reauthenticate(req);
      const target = await db.getAsync("SELECT id FROM Usuarios WHERE id=? AND tenant_id=? AND ativo=1 AND perfil IN ('Gerente','Recepcionista')", [targetId, req.user.tenant_id]);
      if (!target) throw httpError(403, 'O novo administrador deve ser um integrante ativo da mesma arena.');
      await db.runAsync("UPDATE Usuarios SET perfil='Gerente' WHERE id=?", [req.user.id]);
      await db.runAsync("UPDATE Usuarios SET perfil='Administrador' WHERE id=?", [targetId]);
      await revokeUser(req.user.id);
      await revokeUser(targetId);
      // Audit and role changes commit together; an audit failure rolls back both.
      await db.runAsync('INSERT INTO LogsAuditoria(tenant_id,usuario_id,evento,detalhes,ip) VALUES(?,?,?,?,?)',
        [req.user.tenant_id, req.user.id, 'Transferência de administrador', `Administrador anterior: ${req.user.id}; novo administrador: ${targetId}`, req.ip]);
    });
    res.json({ message: 'Administração transferida. As contas envolvidas devem entrar novamente.' });
  } catch (error) { res.status(error.status || 500).json({ error: require('../utils/security').publicError(error, 'Não foi possível transferir a administração.') }); }
};
