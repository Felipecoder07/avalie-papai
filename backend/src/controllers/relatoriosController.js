const db = require('../config/database');

// Helper: formatar período com base em data_inicio e data_fim
function getPeriodo(req) {
  const hoje = new Date().toISOString().split('T')[0];
  const primeiroDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const inicio = req.query.data_inicio || primeiroDiaMes;
  const fim = req.query.data_fim || hoje;
  const quadra_id = req.query.quadra_id || null;
  return { inicio, fim, quadra_id };
}

// ─── FATURAMENTO ────────────────────────────────────────────────────────────
const relatorioFaturamento = async (req, res) => {
  try {
    const { inicio, fim, quadra_id } = getPeriodo(req);

    let whereQuadra = quadra_id ? 'AND r.quadra_id = ?' : '';
    const params = quadra_id ? [inicio, fim, req.user.tenant_id, quadra_id] : [inicio, fim, req.user.tenant_id];

    const reservas = await db.allAsync(`
      SELECT
        r.id,
        r.data_reserva,
        r.hora_inicio,
        r.hora_fim,
        r.valor_total,
        r.status_pagamento,
        r.status,
        c.nome AS cliente_nome,
        q.nome AS quadra_nome,
        u.nome AS operador_nome,
        COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id), 0) AS total_pago,
        COALESCE((SELECT GROUP_CONCAT(DISTINCT metodo) FROM Pagamentos WHERE reserva_id = r.id AND metodo != 'Estorno'), '—') AS metodos
      FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      JOIN Quadras q ON r.quadra_id = q.id
      LEFT JOIN Usuarios u ON r.criado_por = u.id
      WHERE r.data_reserva BETWEEN ? AND ?
        AND r.tenant_id = ?
        AND r.status != 'Cancelada'
        ${whereQuadra}
      ORDER BY r.data_reserva DESC, r.hora_inicio DESC
    `, params);

    const totais = reservas.reduce((acc, r) => {
      acc.bruto += r.valor_total;
      acc.pago += r.total_pago;
      acc.pendente += Math.max(0, r.valor_total - r.total_pago);
      return acc;
    }, { bruto: 0, pago: 0, pendente: 0 });

    res.json({ reservas, totais, periodo: { inicio, fim } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar relatório de faturamento.' });
  }
};

// ─── OCUPAÇÃO ────────────────────────────────────────────────────────────────
const relatorioOcupacao = async (req, res) => {
  try {
    const { inicio, fim, quadra_id } = getPeriodo(req);

    const quadras = await db.allAsync(`SELECT * FROM Quadras WHERE status = 'Ativa' AND tenant_id = ? ${quadra_id ? 'AND id = ?' : ''}`, quadra_id ? [req.user.tenant_id, quadra_id] : [req.user.tenant_id]);

    // Calcular dias no período
    const dtInicio = new Date(inicio);
    const dtFim = new Date(fim);
    const dias = Math.max(1, Math.round((dtFim - dtInicio) / (1000 * 60 * 60 * 24)) + 1);

    const resultado = await Promise.all(quadras.map(async (q) => {
      const [h1, m1] = (q.hora_abertura || '08:00').split(':').map(Number);
      const [h2, m2] = (q.hora_fechamento || '22:00').split(':').map(Number);
      const minutosDiarios = (h2 * 60 + m2) - (h1 * 60 + m1);
      const totalMinutosDisp = minutosDiarios * dias;

      const reservasDaQuadra = await db.allAsync(`
        SELECT hora_inicio, hora_fim FROM Reservas
        WHERE quadra_id = ? AND data_reserva BETWEEN ? AND ? AND status != 'Cancelada'
      `, [q.id, inicio, fim]);

      const bloqueiosDaQuadra = await db.allAsync(`
        SELECT hora_inicio, hora_fim FROM Bloqueios
        WHERE quadra_id = ? AND data_bloqueio BETWEEN ? AND ?
      `, [q.id, inicio, fim]);

      const calcMinutos = (arr) => arr.reduce((acc, item) => {
        const [hA, mA] = item.hora_inicio.split(':').map(Number);
        const [hB, mB] = item.hora_fim.split(':').map(Number);
        return acc + ((hB * 60 + mB) - (hA * 60 + mA));
      }, 0);

      const minutosReservados = calcMinutos(reservasDaQuadra);
      const minutosBloqueados = calcMinutos(bloqueiosDaQuadra);
      const minutosOcupados = minutosReservados + minutosBloqueados;
      const taxa = totalMinutosDisp > 0 ? Math.min(100, Math.round((minutosOcupados / totalMinutosDisp) * 100)) : 0;

      return {
        quadra_id: q.id,
        quadra_nome: q.nome,
        minutosDiarios,
        totalMinutosDisp,
        minutosReservados,
        minutosBloqueados,
        minutosOcupados,
        taxa,
        totalReservas: reservasDaQuadra.length
      };
    }));

    const taxaGeral = resultado.length > 0 ? Math.round(resultado.reduce((a, b) => a + b.taxa, 0) / resultado.length) : 0;

    res.json({ quadras: resultado, taxaGeral, periodo: { inicio, fim, dias } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar relatório de ocupação.' });
  }
};

// ─── RESERVAS ────────────────────────────────────────────────────────────────
const relatorioReservas = async (req, res) => {
  try {
    const { inicio, fim, quadra_id } = getPeriodo(req);

    let whereQuadra = quadra_id ? 'AND r.quadra_id = ?' : '';
    const params = quadra_id ? [inicio, fim, req.user.tenant_id, quadra_id] : [inicio, fim, req.user.tenant_id];

    const reservas = await db.allAsync(`
      SELECT
        r.id, r.data_reserva, r.hora_inicio, r.hora_fim,
        r.valor_total, r.status, r.status_pagamento,
        c.nome AS cliente_nome,
        q.nome AS quadra_nome,
        u.nome AS operador_nome
      FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      JOIN Quadras q ON r.quadra_id = q.id
      LEFT JOIN Usuarios u ON r.criado_por = u.id
      WHERE r.data_reserva BETWEEN ? AND ?
        AND r.tenant_id = ? ${whereQuadra}
      ORDER BY r.data_reserva DESC, r.hora_inicio DESC
    `, params);

    const totalConfirmadas = reservas.filter(r => r.status === 'Confirmada').length;
    const totalCanceladas = reservas.filter(r => r.status === 'Cancelada').length;
    const totalPendentes = reservas.filter(r => r.status === 'Pendente').length;

    res.json({ reservas, totais: { total: reservas.length, confirmadas: totalConfirmadas, canceladas: totalCanceladas, pendentes: totalPendentes }, periodo: { inicio, fim } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar relatório de reservas.' });
  }
};

// ─── INADIMPLÊNCIA ──────────────────────────────────────────────────────────
const relatorioInadimplencia = async (req, res) => {
  try {
    const { inicio, fim, quadra_id } = getPeriodo(req);

    let whereQuadra = quadra_id ? 'AND r.quadra_id = ?' : '';
    const params = quadra_id ? [inicio, fim, req.user.tenant_id, quadra_id] : [inicio, fim, req.user.tenant_id];

    const inadimplentes = await db.allAsync(`
      SELECT
        r.id, r.data_reserva, r.hora_inicio, r.hora_fim,
        r.valor_total, r.status_pagamento,
        c.nome AS cliente_nome,
        c.telefone AS cliente_contato,
        q.nome AS quadra_nome,
        COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id), 0) AS total_pago
      FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      JOIN Quadras q ON r.quadra_id = q.id
      WHERE r.data_reserva BETWEEN ? AND ?
        AND r.tenant_id = ?
        AND r.status != 'Cancelada'
        AND r.status_pagamento != 'Pago'
        ${whereQuadra}
      ORDER BY r.data_reserva DESC
    `, params);

    const comSaldo = inadimplentes.map(r => ({ ...r, saldo_devedor: r.valor_total - r.total_pago })).filter(r => r.saldo_devedor > 0);
    const totalDevido = comSaldo.reduce((acc, r) => acc + r.saldo_devedor, 0);

    res.json({ inadimplentes: comSaldo, totalDevido, periodo: { inicio, fim } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar relatório de inadimplência.' });
  }
};

// ─── CANCELAMENTOS ──────────────────────────────────────────────────────────
const relatorioCancelamentos = async (req, res) => {
  try {
    const { inicio, fim, quadra_id } = getPeriodo(req);

    let whereQuadra = quadra_id ? 'AND r.quadra_id = ?' : '';
    const params = quadra_id ? [inicio, fim, req.user.tenant_id, quadra_id] : [inicio, fim, req.user.tenant_id];

    const cancelamentos = await db.allAsync(`
      SELECT
        r.id, r.data_reserva, r.hora_inicio, r.hora_fim,
        r.valor_total, r.status_pagamento, r.observacoes_cancelamento,
        c.nome AS cliente_nome,
        q.nome AS quadra_nome,
        u.nome AS operador_nome,
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
      WHERE r.data_reserva BETWEEN ? AND ?
        AND r.tenant_id = ?
        AND r.status = 'Cancelada'
        ${whereQuadra}
      ORDER BY r.data_reserva DESC
    `, params);

    const totalValorPerdido = cancelamentos.reduce((acc, r) => acc + r.valor_total, 0);
    const totalEstornado = cancelamentos.filter(r => r.status_pagamento === 'Estornado').length;

    res.json({ cancelamentos, totais: { total: cancelamentos.length, valorPerdido: totalValorPerdido, estornados: totalEstornado }, periodo: { inicio, fim } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar relatório de cancelamentos.' });
  }
};

// ─── FORMAS DE PAGAMENTO ─────────────────────────────────────────────────────
const relatorioFormasPagamento = async (req, res) => {
  try {
    const { inicio, fim, quadra_id } = getPeriodo(req);

    const porMetodo = await db.allAsync(`
      SELECT
        LOWER(p.metodo) AS metodo,
        COUNT(*) AS total_transacoes,
        SUM(p.valor) AS total_valor
      FROM Pagamentos p
      JOIN Reservas r ON p.reserva_id = r.id
      WHERE p.valor > 0
        AND r.status != 'Cancelada'
        AND DATE(p.registrado_em) BETWEEN ? AND ?
        AND r.tenant_id = ?
        ${quadra_id ? 'AND r.quadra_id = ?' : ''}
      GROUP BY LOWER(p.metodo)
      ORDER BY total_valor DESC
    `, quadra_id ? [inicio, fim, req.user.tenant_id, quadra_id] : [inicio, fim, req.user.tenant_id]);

    const totalGeral = porMetodo.reduce((acc, m) => acc + m.total_valor, 0);
    const resultado = porMetodo.map(m => ({
      ...m,
      percentual: totalGeral > 0 ? Math.round((m.total_valor / totalGeral) * 100) : 0
    }));

    const transacoes = await db.allAsync(`
      SELECT
        p.id, p.metodo, p.valor,
        DATE(p.registrado_em) AS data_pagamento,
        TIME(p.registrado_em) AS hora_pagamento,
        r.id AS reserva_id,
        c.nome AS cliente_nome,
        q.nome AS quadra_nome,
        u.nome AS operador_nome
      FROM Pagamentos p
      JOIN Reservas r ON p.reserva_id = r.id
      JOIN Clientes c ON r.cliente_id = c.id
      JOIN Quadras q ON r.quadra_id = q.id
      LEFT JOIN Usuarios u ON p.registrado_por = u.id
      WHERE p.valor > 0
        AND r.status != 'Cancelada'
        AND DATE(p.registrado_em) BETWEEN ? AND ?
        AND r.tenant_id = ?
        ${quadra_id ? 'AND r.quadra_id = ?' : ''}
      ORDER BY p.registrado_em DESC
    `, quadra_id ? [inicio, fim, req.user.tenant_id, quadra_id] : [inicio, fim, req.user.tenant_id]);

    res.json({ porMetodo: resultado, transacoes, totalGeral, periodo: { inicio, fim } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar relatório de formas de pagamento.' });
  }
};

// ─── HORÁRIOS DE PICO ────────────────────────────────────────────────────────
const relatorioHorariosPico = async (req, res) => {
  try {
    const { inicio, fim, quadra_id } = getPeriodo(req);

    const reservas = await db.allAsync(`
      SELECT r.hora_inicio, r.hora_fim, r.data_reserva,
             strftime('%w', r.data_reserva) AS dia_semana
      FROM Reservas r
      WHERE r.data_reserva BETWEEN ? AND ?
        AND r.tenant_id = ?
        AND r.status != 'Cancelada'
        ${quadra_id ? 'AND r.quadra_id = ?' : ''}
    `, quadra_id ? [inicio, fim, req.user.tenant_id, quadra_id] : [inicio, fim, req.user.tenant_id]);

    const diasNomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const porHora = {};
    for (let h = 0; h < 24; h++) porHora[h] = 0;

    reservas.forEach(r => {
      const hInicio = Number.parseInt(r.hora_inicio.split(':')[0]);
      const hFim = Number.parseInt(r.hora_fim.split(':')[0]);
      for (let h = hInicio; h < hFim; h++) {
        porHora[h] = (porHora[h] || 0) + 1;
      }
    });

    const horasAtivas = Object.keys(porHora)
      .map(h => ({ hora: Number.parseInt(h), total: porHora[h] }))
      .filter(h => h.total > 0);

    const maxPico = Math.max(...horasAtivas.map(h => h.total), 1);

    const porDiaSemana = diasNomes.map((nome, idx) => ({
      dia: nome,
      total: reservas.filter(r => Number.parseInt(r.dia_semana) === idx).length
    }));

    res.json({ porHora: horasAtivas, maxPico, porDiaSemana, totalReservas: reservas.length, periodo: { inicio, fim } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar relatório de horários de pico.' });
  }
};

// ─── TOP CLIENTES ────────────────────────────────────────────────────────────
const relatorioTopClientes = async (req, res) => {
  try {
    const { inicio, fim, quadra_id } = getPeriodo(req);
    const limite = Number.parseInt(req.query.limite) || 20;

    const clientes = await db.allAsync(`
      SELECT
        c.id, c.nome, c.telefone,
        COUNT(r.id) AS total_reservas,
        SUM(r.valor_total) AS valor_total_gerado,
        COALESCE(SUM((SELECT SUM(p.valor) FROM Pagamentos p WHERE p.reserva_id = r.id AND p.valor > 0)), 0) AS total_pago,
        MAX(r.data_reserva) AS ultima_reserva,
        MIN(r.data_reserva) AS primeira_reserva
      FROM Clientes c
      JOIN Reservas r ON r.cliente_id = c.id
      WHERE r.data_reserva BETWEEN ? AND ?
        AND r.tenant_id = ?
        AND r.status != 'Cancelada'
        ${quadra_id ? 'AND r.quadra_id = ?' : ''}
      GROUP BY c.id, c.nome, c.telefone
      ORDER BY total_reservas DESC, valor_total_gerado DESC
      LIMIT ?
    `, quadra_id ? [inicio, fim, quadra_id, limite] : [inicio, fim, limite]);

    const comSaldo = clientes.map((c, idx) => ({
      ...c,
      posicao: idx + 1,
      saldo_devedor: Math.max(0, c.valor_total_gerado - c.total_pago),
      ticket_medio: c.total_reservas > 0 ? c.valor_total_gerado / c.total_reservas : 0
    }));

    const totalFaturado = comSaldo.reduce((acc, c) => acc + c.valor_total_gerado, 0);

    res.json({ clientes: comSaldo, totalFaturado, periodo: { inicio, fim } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao gerar relatório de top clientes.' });
  }
};

module.exports = { relatorioFaturamento, relatorioOcupacao, relatorioReservas, relatorioInadimplencia, relatorioCancelamentos, relatorioFormasPagamento, relatorioHorariosPico, relatorioTopClientes };
