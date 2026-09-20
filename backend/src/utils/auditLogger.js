const logger = require('./safeLogger').forModule('auditLogger');
const db = require('../config/database');

const logAuditEvent = (usuario_id, evento, detalhes, ip) => {
  if (usuario_id) {
    db.get('SELECT tenant_id FROM Usuarios WHERE id = ?', [usuario_id], (err, row) => {
      const tenant_id = row ? row.tenant_id : null;
      db.run(
        'INSERT INTO LogsAuditoria (tenant_id, usuario_id, evento, detalhes, ip) VALUES (?, ?, ?, ?, ?)',
        [tenant_id, usuario_id, evento, detalhes, ip],
        (err) => {
          if (err) logger.error('Falha ao registrar log de auditoria:', err);
        }
      );
    });
  } else {
    db.run(
      'INSERT INTO LogsAuditoria (tenant_id, usuario_id, evento, detalhes, ip) VALUES (NULL, ?, ?, ?, ?)',
      [usuario_id, evento, detalhes, ip],
      (err) => {
        if (err) logger.error('Falha ao registrar log de auditoria sem tenant:', err);
      }
    );
  }
};

module.exports = logAuditEvent;
