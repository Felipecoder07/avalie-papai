const { authenticate } = require('../services/sessionService');

async function verificarStatusTenantEManutencao(db, user, originalUrl) {
  if (user.perfil === 'SuperAdmin' || !user.tenant_id) return null;

  try {
    const pathname = (originalUrl || '').split('?')[0];
    const isWhitelistedRoute = pathname.startsWith('/api/tenant/assinatura/') ||
      ['/api/tenant/assinatura', '/api/auth/me', '/api/auth/logout'].includes(pathname);

    const arena = await db.getAsync('SELECT status FROM Arenas WHERE id = ?', [user.tenant_id]);
    if (!arena || arena.status === -1) {
      return { 
        status: 403, 
        body: { error: 'Esta arena foi removida da plataforma. O acesso foi revogado.', deleted: true } 
      };
    }

    if (arena.status === 0 && !isWhitelistedRoute) {
      return { 
        status: 403, 
        body: { error: 'Acesso suspenso por pendência financeira. Acesse a aba Assinatura para regularizar.', blocked: true } 
      };
    }

    const maintRow = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'manutencao_ativa'");
    if (maintRow && maintRow.valor === '1') {
      const msgRow = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'manutencao_mensagem'");
      return {
        status: 503,
        body: {
          error: msgRow && msgRow.valor ? msgRow.valor : 'O sistema está em manutenção programada. Voltamos em instantes.',
          maintenance: true
        }
      };
    }
  } catch (checkErr) {
    return { status: 503, body: { error: 'Não foi possível validar o acesso. Tente novamente.' } };
  }

  return null;
}

const verifyToken = async (req, res, next) => {
  try {
    req.user = await authenticate(req);
    const checkResult = await verificarStatusTenantEManutencao(require('../config/database'), req.user, req.originalUrl);
    if (checkResult) return res.status(checkResult.status).json(checkResult.body);
    next();
  } catch (error) {
    res.status(error.status || 503).json({ error: require('../utils/security').publicError(error, 'Não foi possível validar a sessão.') });
  }
};

const verifySuperAdmin = (req, res, next) => {
  if (!require('../utils/permissions').can(req.user, 'master.manage')) {
    return res.status(403).json({ error: 'Acesso negado. Apenas o Super Administrador pode realizar esta ação.' });
  }
  next();
};

module.exports = { verifyToken, verifySuperAdmin };
