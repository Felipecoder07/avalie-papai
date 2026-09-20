const logger = require('../utils/safeLogger').forModule('auditoriaController');
const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');

const EVENTO_FILTERS = {
  'Login': "l.evento IN ('Login bem-sucedido', 'Tentativa de login falha')",
  'Logout': "l.evento = 'Logout'",
  'Criação de reserva': "l.evento = 'Criação de reserva'",
  'Alteração de reserva': "l.evento IN ('Alteração de reserva', 'Reagendamento de Reserva')",
  'Cancelamento de reserva': "l.evento = 'Cancelamento de reserva'",
  'Registro de pagamento': "l.evento = 'Pagamento Registrado'",
  'Aplicação de desconto': "l.evento = 'Desconto Aplicado'",
  'Estorno de pagamento': "l.evento = 'Estorno Realizado'",
  'Gestão de Quadras': "l.evento IN ('Criação de Quadra', 'Edição de Quadra', 'Status de Quadra', 'Exclusão de Quadra', 'Alteração de Preço')",
  'Alteração de preço': "l.evento IN ('Criação de Quadra', 'Edição de Quadra', 'Status de Quadra', 'Exclusão de Quadra', 'Alteração de Preço')",
  'Bloqueio de quadra': "l.evento IN ('Criação de bloqueio', 'Remoção de bloqueio', 'Desbloqueio Parcial')",
  'Gestão de Usuários': "l.evento IN ('Criação de Usuário', 'Edição de Usuário', 'Exclusão de Usuário')",
  'Alteração de permissões': "l.evento IN ('Criação de Usuário', 'Edição de Usuário', 'Exclusão de Usuário')",
  'Gestão de Clientes': "l.evento IN ('Criação de Cliente', 'Edição de Cliente', 'Arquivamento de Cliente', 'Reativação de Cliente', 'Exclusão de Cliente')",
  'Exclusão de cadastro': "l.evento IN ('Exclusão de Usuário', 'Exclusão de Cliente', 'Arquivamento de Cliente', 'Exclusão de Quadra')",
  'Exportação de relatório': "l.evento = 'Exportação de Relatório'"
};

function buildAuditQuery(tenant_id, { data_inicio, data_fim, busca, evento }) {
  let baseQuery = `
    FROM LogsAuditoria l
    LEFT JOIN Usuarios u ON l.usuario_id = u.id
    WHERE l.tenant_id = ?
  `;
  const params = [tenant_id];

  if (data_inicio) {
    baseQuery += ` AND DATE(l.criado_em) >= ?`;
    params.push(data_inicio);
  }
  if (data_fim) {
    baseQuery += ` AND DATE(l.criado_em) <= ?`;
    params.push(data_fim);
  }
  if (evento) {
    const filter = EVENTO_FILTERS[evento];
    if (filter) {
      baseQuery += ` AND ${filter}`;
    } else {
      baseQuery += ` AND l.evento = ?`;
      params.push(evento);
    }
  }
  if (busca) {
    baseQuery += ` AND (u.nome LIKE ? OR l.detalhes LIKE ? OR l.evento LIKE ? OR l.ip LIKE ? OR (u.nome IS NULL AND ? = 'sistema'))`;
    params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`, `%${busca}%`, busca.toLowerCase().trim());
  }

  return { baseQuery, params };
}

async function fetchAuditStats(tenant_id, data_inicio, data_fim, totalRegistros) {
  let statsDateFilter = '';
  const statsParams = [tenant_id];
  if (data_inicio) {
    statsDateFilter += ` AND DATE(criado_em) >= ?`;
    statsParams.push(data_inicio);
  }
  if (data_fim) {
    statsDateFilter += ` AND DATE(criado_em) <= ?`;
    statsParams.push(data_fim);
  }

  const stats = await db.getAsync(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN evento IN ('Login bem-sucedido', 'Logout', 'Tentativa de login falha') THEN 1 ELSE 0 END) as acessos,
      SUM(CASE WHEN evento IN ('Pagamento Registrado', 'Desconto Aplicado', 'Estorno Realizado') THEN 1 ELSE 0 END) as financeiro,
      SUM(CASE WHEN evento LIKE '%Usuário%' OR evento LIKE '%Cliente%' OR evento LIKE '%Quadra%' OR evento LIKE '%bloqueio%' OR evento LIKE '%Cancelamento%' THEN 1 ELSE 0 END) as cadastrais
    FROM LogsAuditoria
    WHERE tenant_id = ? ${statsDateFilter}
  `, statsParams);

  return {
    total: stats?.total || totalRegistros,
    acessos: stats?.acessos || 0,
    financeiro: stats?.financeiro || 0,
    cadastrais: stats?.cadastrais || 0
  };
}

const listarLogs = async (req, res) => {
  try {
    const { data_inicio, data_fim, busca, evento, pagina = 1, exportar } = req.query;
    const tenant_id = req.user.tenant_id;
    
    const { baseQuery, params } = buildAuditQuery(tenant_id, { data_inicio, data_fim, busca, evento });

    if (exportar === 'true') {
      logAuditEvent(req.user.id, 'Exportação de Relatório', `Exportou relatório de auditoria (CSV) [Filtro: ${data_inicio || 'Início'} até ${data_fim || 'Hoje'}]`, req.ip);
      const dataQuery = `SELECT l.*, u.nome as usuario_nome ${baseQuery} ORDER BY l.criado_em DESC LIMIT 10000`;
      const logs = await db.allAsync(dataQuery, params);
      return res.json(logs);
    }

    const limit = 20;
    const offset = (Math.max(1, Number.parseInt(pagina, 10)) - 1) * limit;

    const countResult = await db.getAsync(`SELECT COUNT(*) as total ${baseQuery}`, params);
    const totalRegistros = countResult.total || 0;
    const totalPaginas = Math.ceil(totalRegistros / limit);

    const dataQuery = `SELECT l.*, u.nome as usuario_nome ${baseQuery} ORDER BY l.criado_em DESC LIMIT ? OFFSET ?`;
    const logs = await db.allAsync(dataQuery, [...params, limit, offset]);

    const estatisticas = await fetchAuditStats(tenant_id, data_inicio, data_fim, totalRegistros);

    res.json({
      logs,
      totalRegistros,
      totalPaginas,
      paginaAtual: Number.parseInt(pagina, 10),
      estatisticas
    });
  } catch (error) {
    logger.error('Erro ao listar logs de auditoria:', error);
    res.status(500).json({ error: 'Erro interno ao buscar logs.' });
  }
};

module.exports = { listarLogs };
