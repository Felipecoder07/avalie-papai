const logger = require('../utils/safeLogger').forModule('relatoriosController');
const db = require('../config/database');

const MAX_PERIOD_DAYS = 366;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function localDate(parts) {
  return `${parts.getFullYear()}-${String(parts.getMonth() + 1).padStart(2, '0')}-${String(parts.getDate()).padStart(2, '0')}`;
}

function parseDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${label} deve usar o formato AAAA-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw badRequest(`${label} é inválida.`);
  }
  return parsed;
}

function positiveInteger(raw, label) {
  if (!/^\d+$/.test(String(raw)) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
    throw badRequest(`${label} deve ser um número inteiro positivo.`);
  }
  return Number(raw);
}

function getPeriodo(req) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const inicio = req.query.data_inicio || localDate(first);
  const fim = req.query.data_fim || localDate(now);
  const start = parseDate(inicio, 'data_inicio');
  const end = parseDate(fim, 'data_fim');
  if (end < start) throw badRequest('data_fim deve ser igual ou posterior a data_inicio.');
  const days = Math.round((end - start) / 86400000);
  if (days > MAX_PERIOD_DAYS) throw badRequest('O intervalo do relatório não pode ser maior que 366 dias.');
  const quadra_id = req.query.quadra_id === undefined || req.query.quadra_id === ''
    ? null
    : positiveInteger(req.query.quadra_id, 'quadra_id');
  return { inicio, fim, quadra_id, dias: days + 1 };
}

function getPagination(req, defaultLimit = DEFAULT_PAGE_SIZE) {
  const pagina = req.query.pagina === undefined ? 1 : positiveInteger(req.query.pagina, 'pagina');
  const limite = req.query.limite === undefined ? defaultLimit : positiveInteger(req.query.limite, 'limite');
  if (limite > MAX_PAGE_SIZE) throw badRequest(`limite não pode ser maior que ${MAX_PAGE_SIZE}.`);
  return { pagina, limite, offset: (pagina - 1) * limite };
}

function paginationResult(total, pagination) {
  const totalRegistros = Number(total || 0);
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / pagination.limite));
  return {
    pagina: pagination.pagina,
    limite: pagination.limite,
    total: totalRegistros,
    totalPaginas,
    temAnterior: pagination.pagina > 1,
    temProxima: pagination.pagina < totalPaginas
  };
}

function queryContext(req, defaultLimit = DEFAULT_PAGE_SIZE) {
  const period = getPeriodo(req);
  const pagination = getPagination(req, defaultLimit);
  const courtSql = period.quadra_id ? 'AND r.quadra_id = ?' : '';
  const params = period.quadra_id
    ? [period.inicio, period.fim, req.user.tenant_id, period.quadra_id]
    : [period.inicio, period.fim, req.user.tenant_id];
  return { ...period, pagination, courtSql, params };
}

function reportError(res, error, fallback) {
  logger.error(error);
  const status = error.status === 400 ? 400 : 500;
  res.status(status).json({ error: status === 400 ? error.message : fallback });
}

const relatorioFaturamento = async (req, res) => {
  try {
    const context = queryContext(req);
    const summary = await db.getAsync(`
      WITH base AS (
        SELECT r.valor_total,
               COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id), 0) AS total_pago
        FROM Reservas r
        WHERE r.data_reserva BETWEEN ? AND ?
          AND r.tenant_id = ? AND r.status != 'Cancelada' ${context.courtSql}
      )
      SELECT COUNT(*) AS total,
             COALESCE(SUM(valor_total), 0) AS bruto,
             COALESCE(SUM(total_pago), 0) AS pago,
             COALESCE(SUM(MAX(0, valor_total - total_pago)), 0) AS pendente
      FROM base
    `, context.params);
    const reservas = await db.allAsync(`
      SELECT r.id, r.data_reserva, r.hora_inicio, r.hora_fim, r.valor_total,
             r.status_pagamento, r.status, c.nome AS cliente_nome, q.nome AS quadra_nome,
             u.nome AS operador_nome,
             COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id), 0) AS total_pago,
             COALESCE((SELECT GROUP_CONCAT(DISTINCT metodo) FROM Pagamentos WHERE reserva_id = r.id AND metodo != 'Estorno'), '—') AS metodos
      FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      JOIN Quadras q ON r.quadra_id = q.id
      LEFT JOIN Usuarios u ON r.criado_por = u.id
      WHERE r.data_reserva BETWEEN ? AND ?
        AND r.tenant_id = ? AND r.status != 'Cancelada' ${context.courtSql}
      ORDER BY r.data_reserva DESC, r.hora_inicio DESC, r.id DESC
      LIMIT ? OFFSET ?
    `, [...context.params, context.pagination.limite, context.pagination.offset]);
    res.json({
      reservas: reservas.map(row => ({ ...row, valor_total: row.valor_total / 100, total_pago: row.total_pago / 100 })),
      totais: { bruto: summary.bruto / 100, pago: summary.pago / 100, pendente: summary.pendente / 100 },
      periodo: { inicio: context.inicio, fim: context.fim },
      paginacao: paginationResult(summary.total, context.pagination)
    });
  } catch (error) {
    reportError(res, error, 'Erro ao gerar relatório de faturamento.');
  }
};

const relatorioOcupacao = async (req, res) => {
  try {
    const { inicio, fim, quadra_id, dias } = getPeriodo(req);
    const quadras = await db.allAsync(`
      SELECT id, nome, hora_abertura, hora_fechamento
      FROM Quadras
      WHERE status = 'Ativa' AND tenant_id = ? ${quadra_id ? 'AND id = ?' : ''}
      ORDER BY id
    `, quadra_id ? [req.user.tenant_id, quadra_id] : [req.user.tenant_id]);
    const resultado = await Promise.all(quadras.map(async court => {
      const [h1, m1] = (court.hora_abertura || '08:00').split(':').map(Number);
      const [h2, m2] = (court.hora_fechamento || '22:00').split(':').map(Number);
      const minutosDiarios = Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
      const [bookings, blocks] = await Promise.all([
        db.getAsync(`
          SELECT COUNT(*) AS total,
                 COALESCE(ROUND(SUM((julianday('2000-01-01 ' || hora_fim) - julianday('2000-01-01 ' || hora_inicio)) * 1440)), 0) AS minutos
          FROM Reservas
          WHERE quadra_id = ? AND data_reserva BETWEEN ? AND ? AND status != 'Cancelada'
        `, [court.id, inicio, fim]),
        db.getAsync(`
          SELECT COALESCE(ROUND(SUM((julianday('2000-01-01 ' || hora_fim) - julianday('2000-01-01 ' || hora_inicio)) * 1440)), 0) AS minutos
          FROM Bloqueios
          WHERE quadra_id = ? AND data_bloqueio BETWEEN ? AND ?
        `, [court.id, inicio, fim])
      ]);
      const totalMinutosDisp = minutosDiarios * dias;
      const minutosReservados = Number(bookings.minutos);
      const minutosBloqueados = Number(blocks.minutos);
      const minutosOcupados = minutosReservados + minutosBloqueados;
      return {
        quadra_id: court.id,
        quadra_nome: court.nome,
        minutosDiarios,
        totalMinutosDisp,
        minutosReservados,
        minutosBloqueados,
        minutosOcupados,
        taxa: totalMinutosDisp > 0 ? Math.min(100, Math.round((minutosOcupados / totalMinutosDisp) * 100)) : 0,
        totalReservas: Number(bookings.total)
      };
    }));
    const taxaGeral = resultado.length ? Math.round(resultado.reduce((sum, item) => sum + item.taxa, 0) / resultado.length) : 0;
    res.json({ quadras: resultado, taxaGeral, periodo: { inicio, fim, dias } });
  } catch (error) {
    reportError(res, error, 'Erro ao gerar relatório de ocupação.');
  }
};

const relatorioReservas = async (req, res) => {
  try {
    const context = queryContext(req);
    const summary = await db.getAsync(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN r.status = 'Confirmada' THEN 1 ELSE 0 END) AS confirmadas,
             SUM(CASE WHEN r.status = 'Cancelada' THEN 1 ELSE 0 END) AS canceladas,
             SUM(CASE WHEN r.status = 'Pendente' THEN 1 ELSE 0 END) AS pendentes
      FROM Reservas r
      WHERE r.data_reserva BETWEEN ? AND ? AND r.tenant_id = ? ${context.courtSql}
    `, context.params);
    const reservas = await db.allAsync(`
      SELECT r.id, r.data_reserva, r.hora_inicio, r.hora_fim, r.valor_total,
             r.status, r.status_pagamento, c.nome AS cliente_nome, q.nome AS quadra_nome,
             u.nome AS operador_nome
      FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      JOIN Quadras q ON r.quadra_id = q.id
      LEFT JOIN Usuarios u ON r.criado_por = u.id
      WHERE r.data_reserva BETWEEN ? AND ? AND r.tenant_id = ? ${context.courtSql}
      ORDER BY r.data_reserva DESC, r.hora_inicio DESC, r.id DESC
      LIMIT ? OFFSET ?
    `, [...context.params, context.pagination.limite, context.pagination.offset]);
    res.json({
      reservas: reservas.map(row => ({ ...row, valor_total: row.valor_total / 100 })),
      totais: {
        total: Number(summary.total),
        confirmadas: Number(summary.confirmadas || 0),
        canceladas: Number(summary.canceladas || 0),
        pendentes: Number(summary.pendentes || 0)
      },
      periodo: { inicio: context.inicio, fim: context.fim },
      paginacao: paginationResult(summary.total, context.pagination)
    });
  } catch (error) {
    reportError(res, error, 'Erro ao gerar relatório de reservas.');
  }
};

const relatorioInadimplencia = async (req, res) => {
  try {
    const context = queryContext(req);
    const base = `
      WITH base AS (
        SELECT r.id, r.data_reserva, r.hora_inicio, r.hora_fim, r.valor_total,
               r.status_pagamento, c.nome AS cliente_nome, c.telefone AS cliente_contato,
               q.nome AS quadra_nome,
               COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id), 0) AS total_pago
        FROM Reservas r
        JOIN Clientes c ON r.cliente_id = c.id
        JOIN Quadras q ON r.quadra_id = q.id
        WHERE r.data_reserva BETWEEN ? AND ? AND r.tenant_id = ?
          AND r.status != 'Cancelada' AND r.status_pagamento != 'Pago' ${context.courtSql}
      )`;
    const summary = await db.getAsync(`${base}
      SELECT COUNT(*) AS total, COALESCE(SUM(valor_total - total_pago), 0) AS total_devido
      FROM base WHERE valor_total > total_pago
    `, context.params);
    const rows = await db.allAsync(`${base}
      SELECT * FROM base WHERE valor_total > total_pago
      ORDER BY data_reserva DESC, id DESC LIMIT ? OFFSET ?
    `, [...context.params, context.pagination.limite, context.pagination.offset]);
    res.json({
      inadimplentes: rows.map(row => ({
        ...row,
        saldo_devedor: (row.valor_total - row.total_pago) / 100,
        valor_total: row.valor_total / 100,
        total_pago: row.total_pago / 100
      })),
      totalDevido: summary.total_devido / 100,
      periodo: { inicio: context.inicio, fim: context.fim },
      paginacao: paginationResult(summary.total, context.pagination)
    });
  } catch (error) {
    reportError(res, error, 'Erro ao gerar relatório de inadimplência.');
  }
};

const relatorioCancelamentos = async (req, res) => {
  try {
    const context = queryContext(req);
    const summary = await db.getAsync(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(r.valor_total), 0) AS valor_perdido,
             SUM(CASE WHEN r.status_pagamento = 'Estornado' THEN 1 ELSE 0 END) AS estornados
      FROM Reservas r
      WHERE r.data_reserva BETWEEN ? AND ? AND r.tenant_id = ?
        AND r.status = 'Cancelada' ${context.courtSql}
    `, context.params);
    const rows = await db.allAsync(`
      SELECT r.id, r.data_reserva, r.hora_inicio, r.hora_fim, r.valor_total,
             r.status_pagamento, r.observacoes_cancelamento, c.nome AS cliente_nome,
             q.nome AS quadra_nome, u.nome AS operador_nome,
             CASE
               WHEN r.motivo_cancelamento_id = -1 THEN 'Desistência do Cliente'
               WHEN r.motivo_cancelamento_id = -2 THEN 'Condições Climáticas'
               WHEN r.motivo_cancelamento_id = -3 THEN 'Manutenção da Quadra'
               ELSE m.motivo
             END AS motivo_cancelamento,
             COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id AND valor > 0), 0) AS total_pago
      FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      JOIN Quadras q ON r.quadra_id = q.id
      LEFT JOIN Usuarios u ON r.criado_por = u.id
      LEFT JOIN MotivosCancelamento m ON r.motivo_cancelamento_id = m.id
      WHERE r.data_reserva BETWEEN ? AND ? AND r.tenant_id = ?
        AND r.status = 'Cancelada' ${context.courtSql}
      ORDER BY r.data_reserva DESC, r.id DESC LIMIT ? OFFSET ?
    `, [...context.params, context.pagination.limite, context.pagination.offset]);
    res.json({
      cancelamentos: rows.map(row => ({ ...row, valor_total: row.valor_total / 100, total_pago: row.total_pago / 100 })),
      totais: {
        total: Number(summary.total),
        valorPerdido: summary.valor_perdido / 100,
        estornados: Number(summary.estornados || 0)
      },
      periodo: { inicio: context.inicio, fim: context.fim },
      paginacao: paginationResult(summary.total, context.pagination)
    });
  } catch (error) {
    reportError(res, error, 'Erro ao gerar relatório de cancelamentos.');
  }
};

const relatorioFormasPagamento = async (req, res) => {
  try {
    const context = queryContext(req);
    const porMetodo = await db.allAsync(`
      SELECT LOWER(p.metodo) AS metodo, COUNT(*) AS total_transacoes, SUM(p.valor) AS total_valor
      FROM Pagamentos p
      JOIN Reservas r ON p.reserva_id = r.id
      WHERE p.valor > 0 AND r.status != 'Cancelada'
        AND DATE(p.registrado_em) BETWEEN ? AND ? AND r.tenant_id = ? ${context.courtSql}
      GROUP BY LOWER(p.metodo) ORDER BY total_valor DESC
    `, context.params);
    const totalCents = porMetodo.reduce((sum, method) => sum + Number(method.total_valor), 0);
    const totalTransactions = porMetodo.reduce((sum, method) => sum + Number(method.total_transacoes), 0);
    const transacoes = await db.allAsync(`
      SELECT p.id, p.metodo, p.valor, DATE(p.registrado_em) AS data_pagamento,
             TIME(p.registrado_em) AS hora_pagamento, r.id AS reserva_id,
             c.nome AS cliente_nome, q.nome AS quadra_nome, u.nome AS operador_nome
      FROM Pagamentos p
      JOIN Reservas r ON p.reserva_id = r.id
      JOIN Clientes c ON r.cliente_id = c.id
      JOIN Quadras q ON r.quadra_id = q.id
      LEFT JOIN Usuarios u ON p.registrado_por = u.id
      WHERE p.valor > 0 AND r.status != 'Cancelada'
        AND DATE(p.registrado_em) BETWEEN ? AND ? AND r.tenant_id = ? ${context.courtSql}
      ORDER BY p.registrado_em DESC, p.id DESC LIMIT ? OFFSET ?
    `, [...context.params, context.pagination.limite, context.pagination.offset]);
    res.json({
      porMetodo: porMetodo.map(method => ({
        ...method,
        total_valor: method.total_valor / 100,
        percentual: totalCents > 0 ? Math.round((method.total_valor / totalCents) * 100) : 0
      })),
      transacoes: transacoes.map(row => ({ ...row, valor: row.valor / 100 })),
      totalGeral: totalCents / 100,
      periodo: { inicio: context.inicio, fim: context.fim },
      paginacao: paginationResult(totalTransactions, context.pagination)
    });
  } catch (error) {
    reportError(res, error, 'Erro ao gerar relatório de formas de pagamento.');
  }
};

const relatorioHorariosPico = async (req, res) => {
  try {
    const { inicio, fim, quadra_id } = getPeriodo(req);
    const courtSql = quadra_id ? 'AND r.quadra_id = ?' : '';
    const params = quadra_id ? [inicio, fim, req.user.tenant_id, quadra_id] : [inicio, fim, req.user.tenant_id];
    const [porHora, porDiaRows, totalRow] = await Promise.all([
      db.allAsync(`
        WITH RECURSIVE hours(hora) AS (SELECT 0 UNION ALL SELECT hora + 1 FROM hours WHERE hora < 23)
        SELECT hours.hora, COUNT(r.id) AS total
        FROM hours
        LEFT JOIN Reservas r ON CAST(SUBSTR(r.hora_inicio, 1, 2) AS INTEGER) <= hours.hora
          AND CAST(SUBSTR(r.hora_fim, 1, 2) AS INTEGER) > hours.hora
          AND r.data_reserva BETWEEN ? AND ? AND r.tenant_id = ?
          AND r.status != 'Cancelada' ${courtSql}
        GROUP BY hours.hora HAVING COUNT(r.id) > 0 ORDER BY hours.hora
      `, params),
      db.allAsync(`
        SELECT CAST(strftime('%w', r.data_reserva) AS INTEGER) AS dia, COUNT(*) AS total
        FROM Reservas r
        WHERE r.data_reserva BETWEEN ? AND ? AND r.tenant_id = ?
          AND r.status != 'Cancelada' ${courtSql}
        GROUP BY strftime('%w', r.data_reserva)
      `, params),
      db.getAsync(`
        SELECT COUNT(*) AS total FROM Reservas r
        WHERE r.data_reserva BETWEEN ? AND ? AND r.tenant_id = ?
          AND r.status != 'Cancelada' ${courtSql}
      `, params)
    ]);
    const days = new Map(porDiaRows.map(row => [Number(row.dia), Number(row.total)]));
    const porDiaSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dia, index) => ({ dia, total: days.get(index) || 0 }));
    res.json({
      porHora,
      maxPico: Math.max(...porHora.map(item => item.total), 1),
      porDiaSemana,
      totalReservas: Number(totalRow.total),
      periodo: { inicio, fim }
    });
  } catch (error) {
    reportError(res, error, 'Erro ao gerar relatório de horários de pico.');
  }
};

const relatorioTopClientes = async (req, res) => {
  try {
    const context = queryContext(req, 20);
    const base = `
      WITH ranking AS (
        SELECT c.id, c.nome, c.telefone, COUNT(r.id) AS total_reservas,
               SUM(r.valor_total) AS valor_total_gerado,
               COALESCE(SUM((SELECT COALESCE(SUM(p.valor), 0) FROM Pagamentos p WHERE p.reserva_id = r.id AND p.valor > 0)), 0) AS total_pago,
               MAX(r.data_reserva) AS ultima_reserva, MIN(r.data_reserva) AS primeira_reserva
        FROM Clientes c
        JOIN Reservas r ON r.cliente_id = c.id
        WHERE r.data_reserva BETWEEN ? AND ? AND r.tenant_id = ?
          AND r.status != 'Cancelada' ${context.courtSql}
        GROUP BY c.id, c.nome, c.telefone
      )`;
    const summary = await db.getAsync(`${base}
      SELECT COUNT(*) AS total, COALESCE(SUM(valor_total_gerado), 0) AS faturado FROM ranking
    `, context.params);
    const clientes = await db.allAsync(`${base}
      SELECT * FROM ranking
      ORDER BY total_reservas DESC, valor_total_gerado DESC, id ASC
      LIMIT ? OFFSET ?
    `, [...context.params, context.pagination.limite, context.pagination.offset]);
    res.json({
      clientes: clientes.map((client, index) => ({
        ...client,
        posicao: context.pagination.offset + index + 1,
        valor_total_gerado: client.valor_total_gerado / 100,
        total_pago: client.total_pago / 100,
        saldo_devedor: Math.max(0, (client.valor_total_gerado - client.total_pago) / 100),
        ticket_medio: client.total_reservas ? (client.valor_total_gerado / 100) / client.total_reservas : 0
      })),
      totalFaturado: summary.faturado / 100,
      periodo: { inicio: context.inicio, fim: context.fim },
      paginacao: paginationResult(summary.total, context.pagination)
    });
  } catch (error) {
    reportError(res, error, 'Erro ao gerar relatório de top clientes.');
  }
};

module.exports = {
  MAX_PAGE_SIZE,
  MAX_PERIOD_DAYS,
  getPagination,
  getPeriodo,
  relatorioFaturamento,
  relatorioOcupacao,
  relatorioReservas,
  relatorioInadimplencia,
  relatorioCancelamentos,
  relatorioFormasPagamento,
  relatorioHorariosPico,
  relatorioTopClientes
};
