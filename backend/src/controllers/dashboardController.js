const logger = require('../utils/safeLogger').forModule('dashboardController');
const db = require('../config/database');
const { getTodayString, getLocalTimeString } = require('../utils/dateUtils');

const obterResumoDia = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const arena = await db.getAsync('SELECT fuso_horario FROM Arenas WHERE id = ?', [tenant_id]);
    const fuso = arena && arena.fuso_horario ? arena.fuso_horario : 'America/Sao_Paulo';

    const hoje = getTodayString(fuso);
    
    // RF-DASH-001: Faturamento do Dia
    // Soma de pagamentos registrados hoje para reservas ativas (não canceladas)
    const faturamentoDiaResult = await db.getAsync(`
      SELECT COALESCE(SUM(p.valor), 0) as total
      FROM Pagamentos p
      JOIN Reservas r ON p.reserva_id = r.id
      WHERE DATE(p.registrado_em) = ? AND r.status != 'Cancelada' AND r.tenant_id = ?
    `, [hoje, tenant_id]);
    const faturamentoDia = faturamentoDiaResult.total || 0;

    // RF-DASH-002: Faturamento Pendente
    // Soma de (valor_total - pagamentos) das reservas de hoje que não estão pagas
    const reservasPendentesResult = await db.allAsync(`
      SELECT r.id, r.valor_total, 
        COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id), 0) as pago
      FROM Reservas r
      WHERE r.data_reserva = ? AND r.status_pagamento != 'Pago' AND r.status != 'Cancelada' AND r.tenant_id = ?
    `, [hoje, tenant_id]);
    
    let faturamentoPendente = 0;
    reservasPendentesResult.forEach(r => {
      faturamentoPendente += (r.valor_total - r.pago);
    });

    // RF-DASH-003: Reservas do Dia
    const reservasDiaResult = await db.getAsync(`
      SELECT COUNT(*) as total
      FROM Reservas
      WHERE data_reserva = ? AND status != 'Cancelada' AND tenant_id = ?
    `, [hoje, tenant_id]);
    const reservasDia = reservasDiaResult.total || 0;

    // RF-DASH-006: Próximas Reservas
    const horaAtual = getLocalTimeString(fuso); // "HH:MM" no fuso da arena
    const proximasReservas = await db.allAsync(`
      SELECT r.id, r.hora_inicio, r.hora_fim, r.status, r.status_pagamento, q.nome as quadra_nome,
             c.nome as cliente_nome
      FROM Reservas r
      JOIN Quadras q ON r.quadra_id = q.id
      JOIN Clientes c ON r.cliente_id = c.id
      WHERE r.data_reserva = ? AND r.hora_inicio >= ? AND r.status != 'Cancelada' AND r.tenant_id = ?
      ORDER BY r.hora_inicio ASC
      LIMIT 5
    `, [hoje, horaAtual, tenant_id]);

    // RF-DASH-012: Alertas (Reservas antigas que ainda não foram pagas)
    const alertas = await db.allAsync(`
      SELECT r.id, r.hora_inicio, r.data_reserva, q.nome as quadra_nome, c.nome as cliente_nome
      FROM Reservas r
      JOIN Quadras q ON r.quadra_id = q.id
      JOIN Clientes c ON r.cliente_id = c.id
      WHERE r.status_pagamento != 'Pago' AND r.status != 'Cancelada' AND r.tenant_id = ?
        AND (r.data_reserva < ? OR (r.data_reserva = ? AND r.hora_inicio < ?))
      ORDER BY r.data_reserva DESC, r.hora_inicio DESC
      LIMIT 3
    `, [tenant_id, hoje, hoje, horaAtual]);

    // Status das Quadras (Em uso ou Livres no momento exato)
    const quadras = await db.allAsync('SELECT id, nome, status FROM Quadras WHERE status = "Ativa" AND tenant_id = ?', [tenant_id]);
    const quadrasStatus = await Promise.all(quadras.map(async (q) => {
      // Verifica se existe alguma reserva confirmada rolando agora nesta quadra
      const emUso = await db.getAsync(`
        SELECT c.nome as cliente_nome 
        FROM Reservas r
        JOIN Clientes c ON r.cliente_id = c.id
        WHERE r.quadra_id = ? AND r.data_reserva = ? AND r.status != 'Cancelada'
          AND r.hora_inicio <= ? AND r.hora_fim > ? AND r.tenant_id = ?
      `, [q.id, hoje, horaAtual, horaAtual, tenant_id]);
      
      return {
        id: q.id,
        nome: q.nome,
        estado: emUso ? 'Em uso' : 'Livre',
        cliente: emUso ? emUso.cliente_nome : null
      };
    }));

    // Faturamento do Mês
    const mesAtual = hoje.substring(0, 7); // "YYYY-MM"
    const faturamentoMesResult = await db.getAsync(`
      SELECT COALESCE(SUM(p.valor), 0) as total
      FROM Pagamentos p
      JOIN Reservas r ON p.reserva_id = r.id
      WHERE strftime('%Y-%m', p.registrado_em) = ? AND r.status != 'Cancelada' AND r.tenant_id = ?
    `, [mesAtual, tenant_id]);
    const faturamentoMes = faturamentoMesResult.total || 0;

    // Inadimplência Global (Aberto)
    const inadimplenciaGeralResult = await db.allAsync(`
      SELECT c.nome, r.valor_total,
        COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id), 0) as pago
      FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      WHERE r.status_pagamento != 'Pago' AND r.status != 'Cancelada' AND r.tenant_id = ?
      ORDER BY r.data_reserva DESC
      LIMIT 4
    `, [tenant_id]);
    
    let inadimplentes = inadimplenciaGeralResult.map(r => ({
      nome: r.nome,
      deve: r.valor_total - r.pago
    })).filter(r => r.deve > 0);

    // RF-DASH-004: Taxa de Ocupação Diária
    const todasQuadras = await db.allAsync('SELECT * FROM Quadras WHERE status = "Ativa" AND tenant_id = ?', [tenant_id]);
    
    let totalMinutosDisponiveis = 0;
    todasQuadras.forEach(q => {
      const open = q.hora_abertura || '08:00';
      const close = q.hora_fechamento || '22:00';
      const [h1, m1] = open.split(':').map(Number);
      const [h2, m2] = close.split(':').map(Number);
      totalMinutosDisponiveis += ((h2 * 60 + m2) - (h1 * 60 + m1));
    });

    const reservasOcupacao = await db.allAsync(`
      SELECT hora_inicio, hora_fim FROM Reservas WHERE data_reserva = ? AND status != 'Cancelada' AND tenant_id = ?
    `, [hoje, tenant_id]);
    const bloqueiosOcupacao = await db.allAsync(`
      SELECT b.hora_inicio, b.hora_fim 
      FROM Bloqueios b
      JOIN Quadras q ON b.quadra_id = q.id
      WHERE b.data_bloqueio = ? AND q.tenant_id = ?
    `, [hoje, tenant_id]);

    let totalMinutosOcupados = 0;
    const calcMinutos = (arr) => {
      arr.forEach(item => {
        const [h1, m1] = item.hora_inicio.split(':').map(Number);
        const [h2, m2] = item.hora_fim.split(':').map(Number);
        totalMinutosOcupados += ((h2 * 60 + m2) - (h1 * 60 + m1));
      });
    };
    calcMinutos(reservasOcupacao);
    calcMinutos(bloqueiosOcupacao);

    let taxaOcupacao = 0;
    if (totalMinutosDisponiveis > 0) {
      taxaOcupacao = Math.round((totalMinutosOcupados / totalMinutosDisponiveis) * 100);
      if (taxaOcupacao > 100) taxaOcupacao = 100; // Limite de 100% (segurança contra sobreposições)
    }

    res.json({
      hoje,
      faturamentoDia,
      faturamentoPendente,
      reservasDia,
      taxaOcupacao,
      proximasReservas,
      alertas,
      quadrasStatus,
      faturamentoMes,
      inadimplentes
    });

  } catch (error) {
    logger.error('Erro ao gerar dashboard do dia:', error);
    res.status(500).json({ error: 'Erro interno ao carregar indicadores.' });
  }
};

module.exports = { obterResumoDia };
