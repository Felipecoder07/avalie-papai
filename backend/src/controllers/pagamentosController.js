const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');
const { getTodayString, getLocalTimeString } = require('../utils/dateUtils');

// Função auxiliar para recalcular status da reserva com base nos pagamentos efetuados (RN-005 e RN-006)
const atualizarStatusReserva = async (reserva_id, tenant_id) => {
  const reserva = await db.getAsync('SELECT valor_total, status, status_pagamento FROM Reservas WHERE id = ? AND tenant_id = ?', [reserva_id, tenant_id]);
  const resultPagamentos = await db.getAsync('SELECT SUM(valor) as total_pago FROM Pagamentos WHERE reserva_id = ?', [reserva_id]);

  const totalPago = resultPagamentos.total_pago || 0;
  const saldoDevedor = reserva.valor_total - totalPago;

  let novoStatus = 'Pendente';
  if (reserva.status === 'Cancelada') {
    if (totalPago <= 0) {
      novoStatus = (reserva.status_pagamento === 'Estornado' || totalPago === 0) ? 'Estornado' : 'Cancelado';
    } else {
      novoStatus = 'Parcial'; 
    }
  } else {
    if (saldoDevedor <= 0) novoStatus = 'Pago';
    else if (totalPago > 0) novoStatus = 'Parcial';
  }

  await db.runAsync('UPDATE Reservas SET status_pagamento = ? WHERE id = ?', [novoStatus, reserva_id]);
  return { totalPago, saldoDevedor, novoStatus };
};

const registrarPagamento = async (req, res) => {
  try {
    const { reserva_id, valor, metodo } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.ip;
    const usuario_id = req.user ? req.user.id : null;

    const mapaMetodos = {
      'pix': 'Pix',
      'pix (manual)': 'Pix',
      'pix online': 'Pix Online',
      'pix online (gateway)': 'Pix Online',
      'dinheiro': 'Dinheiro',
      'credito': 'Cartão de Crédito',
      'cartao de credito': 'Cartão de Crédito',
      'cartão de crédito': 'Cartão de Crédito',
      'debito': 'Cartão de Débito',
      'cartao de debito': 'Cartão de Débito',
      'cartão de débito': 'Cartão de Débito',
      'voucher': 'Voucher Interno',
      'voucher interno': 'Voucher Interno',
      'maquineta': 'Cartão (Maquineta)',
      'cartão (maquineta)': 'Cartão (Maquineta)',
      'cartão (maquineta online)': 'Cartão (Maquineta)'
    };

    const metodoNormalizado = mapaMetodos[metodo ? metodo.toLowerCase().trim() : ''] || metodo;

    const whitelistMetodos = [
      'Pix', 
      'Dinheiro', 
      'Cartão de Crédito', 
      'Cartão de Débito', 
      'Voucher Interno',
      'Pix Online',
      'Cartão de Crédito Online',
      'Cartão (Maquineta)'
    ];
    if (!whitelistMetodos.includes(metodoNormalizado)) {
      return res.status(400).json({ error: `Método de pagamento inválido. Escolha um entre: ${whitelistMetodos.join(', ')}` });
    }

    if (valor <= 0) return res.status(400).json({ error: 'O valor deve ser maior que zero.' });

    // Validar se o valor excede o saldo devedor e se a reserva não está cancelada
    const reserva = await db.getAsync('SELECT valor_total, status FROM Reservas WHERE id = ? AND tenant_id = ?', [reserva_id, req.user.tenant_id]);
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada.' });
    if (reserva.status === 'Cancelada') {
      return res.status(400).json({ error: 'Não é permitido registrar pagamentos para uma reserva cancelada.' });
    }
    
    const resultPagamentos = await db.getAsync('SELECT SUM(valor) as total_pago FROM Pagamentos WHERE reserva_id = ?', [reserva_id]);
    const totalPago = resultPagamentos.total_pago || 0;
    const saldoAtual = reserva.valor_total - totalPago;

    if (valor > saldoAtual) {
      return res.status(400).json({ error: `O valor (R$ ${valor.toFixed(2)}) não pode ser maior que o saldo devedor (R$ ${saldoAtual.toFixed(2)}).` });
    }

    // Salvar pagamento no histórico
    const insert = await db.runAsync(
      'INSERT INTO Pagamentos (reserva_id, valor, metodo, registrado_por) VALUES (?, ?, ?, ?)',
      [reserva_id, valor, metodoNormalizado, usuario_id]
    );

    // Calcular novo saldo (RN-005) e atualizar status da reserva (RN-006)
    const { saldoDevedor, novoStatus } = await atualizarStatusReserva(reserva_id, req.user.tenant_id);

    logAuditEvent(usuario_id, 'Pagamento Registrado', `Reserva: ${reserva_id}, Valor: ${valor}, Método: ${metodo}`, ip);

    // Dispara e-mail de confirmação de pagamento em background (defensivo)
    (async () => {
      try {
        const clientQuery = `
          SELECT c.nome, c.email, r.data_reserva, r.hora_inicio, r.hora_fim, q.nome as quadra_nome, r.valor_total
          FROM Reservas r
          JOIN Clientes c ON r.cliente_id = c.id
          JOIN Quadras q ON r.quadra_id = q.id
          WHERE r.id = ?
        `;
        const details = await db.getAsync(clientQuery, [reserva_id]);
        const arena = await db.getAsync('SELECT nome FROM Arenas WHERE id = ?', [req.user.tenant_id]);
        
        if (details && details.email) {
          const { sendEmail } = require('../services/emailService');
          const subject = `Comprovante de Pagamento - ${arena ? arena.nome : 'Arenix'}`;
          const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
              <h2 style="color: #2F855A;">Olá, ${details.nome}! Recibo de Pagamento 🧾</h2>
              <p>Confirmamos o recebimento do seu pagamento referente ao agendamento de quadra.</p>
              <div style="background-color: #F7FAFC; border: 1px solid #E2E8F0; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <strong>Detalhes do Pagamento:</strong><br />
                💰 <strong>Valor Pago:</strong> R$ ${Number.parseFloat(valor).toFixed(2).replace('.', ',')}<br />
                💳 <strong>Método:</strong> ${metodo}<br />
                📅 <strong>Data da Reserva:</strong> ${details.data_reserva.split('-').reverse().join('/')}<br />
                🕒 <strong>Horário:</strong> ${details.hora_inicio} às ${details.hora_fim}<br />
                🎾 <strong>Quadra:</strong> ${details.quadra_nome}<br />
                <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 10px 0;" />
                📉 <strong>Saldo Devedor Restante:</strong> R$ ${saldoDevedor.toFixed(2).replace('.', ',')}<br />
                📊 <strong>Status do Pagamento:</strong> ${novoStatus === 'Pago' ? 'Pago (Quitado) ✅' : 'Pagamento Parcial ⚠️'}
              </div>
              <p>Obrigado e bom jogo!</p>
              <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 20px 0;" />
              <p style="font-size: 0.8em; color: #A0AEC0;">Esta é uma mensagem automática enviada por Arenix CourtManager em nome de ${arena ? arena.nome : 'sua Arena'}.</p>
            </div>
          `;
          await sendEmail(details.email, subject, html);
        }
      } catch (e) {
        console.error('[SMTP] Erro ao disparar e-mail de recibo:', e.message);
      }
    })();

    res.status(201).json({
      message: 'Pagamento registrado com sucesso.',
      pagamento_id: insert.lastID,
      saldo_devedor: saldoDevedor,
      status_pagamento: novoStatus
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno ao registrar pagamento.' });
  }
};

const aplicarDesconto = async (req, res) => {
  try {
    const { reserva_id, desconto_percentual } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.ip;
    const usuario = req.user;

    if (desconto_percentual < 0 || desconto_percentual > 100) {
      return res.status(400).json({ error: 'O desconto deve estar entre 0% e 100%.' });
    }

    // RN-007: Gerentes podem dar até 30% de desconto. Admins não tem limite.
    if (usuario.perfil === 'Gerente' && desconto_percentual > 30) {
      return res.status(403).json({ error: 'Gerentes só podem aplicar no máximo 30% de desconto.' });
    }

    const reserva = await db.getAsync('SELECT valor_total FROM Reservas WHERE id = ? AND tenant_id = ?', [reserva_id, req.user.tenant_id]);
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada.' });

    // Buscar quanto o cliente já pagou para não permitir valor total abaixo do já pago
    const resultPagamentos = await db.getAsync('SELECT SUM(valor) as total_pago FROM Pagamentos WHERE reserva_id = ?', [reserva_id]);
    const totalPago = resultPagamentos.total_pago || 0;

    const valorDesconto = reserva.valor_total * (desconto_percentual / 100);
    const novoValorTotal = reserva.valor_total - valorDesconto;

    if (novoValorTotal < totalPago) {
      return res.status(400).json({ error: `Desconto inválido. O novo valor (R$ ${novoValorTotal.toFixed(2)}) não pode ser inferior ao valor já pago pelo cliente (R$ ${totalPago.toFixed(2)}).` });
    }

    await db.runAsync('UPDATE Reservas SET valor_total = ? WHERE id = ?', [novoValorTotal, reserva_id]);
    const { saldoDevedor, novoStatus } = await atualizarStatusReserva(reserva_id, req.user.tenant_id);

    logAuditEvent(usuario.id, 'Desconto Aplicado', `Reserva: ${reserva_id}, Desconto: ${desconto_percentual}%`, ip);

    res.json({
      message: 'Desconto aplicado com sucesso.',
      novo_valor_total: novoValorTotal,
      saldo_devedor: saldoDevedor
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao aplicar desconto.' });
  }
};

async function resolveEstornoTarget(tenant_id, pagamento_id, reserva_id) {
  if (pagamento_id) {
    const pagamento = await db.getAsync(
      'SELECT p.* FROM Pagamentos p JOIN Reservas r ON p.reserva_id = r.id WHERE p.id = ? AND r.tenant_id = ?',
      [pagamento_id, tenant_id]
    );
    if (!pagamento) return { error: 'Pagamento não encontrado.', status: 404 };
    if (pagamento.valor < 0) return { error: 'Pagamento já é um estorno.', status: 400 };
    return { finalReservaId: pagamento.reserva_id, maxEstornavel: pagamento.valor };
  }
  
  if (reserva_id) {
    const reserva = await db.getAsync(
      'SELECT r.* FROM Reservas r WHERE r.id = ? AND r.tenant_id = ?',
      [reserva_id, tenant_id]
    );
    if (!reserva) return { error: 'Reserva não encontrada.', status: 404 };
    return { finalReservaId: reserva.id, maxEstornavel: 0 };
  }

  return { error: 'É necessário informar pagamento_id ou reserva_id.', status: 400 };
}

async function dispararEmailEstorno(tenant_id, finalReservaId, valorEstornoInfo, descMotivo) {
  try {
    const clientQuery = `
      SELECT c.nome, c.email, r.data_reserva, r.hora_inicio, r.hora_fim, q.nome as quadra_nome
      FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      JOIN Quadras q ON r.quadra_id = q.id
      WHERE r.id = ?
    `;
    const details = await db.getAsync(clientQuery, [finalReservaId]);
    const arena = await db.getAsync('SELECT nome FROM Arenas WHERE id = ?', [tenant_id]);
    
    if (details && details.email) {
      const { sendEmail } = require('../services/emailService');
      const subject = `Reembolso / Estorno Realizado - ${arena ? arena.nome : 'Arenix'}`;
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
          <h2 style="color: #DD6B20;">Notificação de Estorno / Reembolso ↩️</h2>
          <p>Olá, ${details.nome}. Informamos que um estorno de pagamento foi registrado para o seu agendamento.</p>
          <div style="background-color: #FFFAF0; border: 1px solid #FEEBC8; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Detalhes do Estorno:</strong><br />
            💰 <strong>Valor Estornado:</strong> R$ ${Number.parseFloat(valorEstornoInfo).toFixed(2).replace('.', ',')}<br />
            ❌ <strong>Motivo/Justificativa:</strong> ${descMotivo}<br />
            📅 <strong>Reserva Original:</strong> ${details.data_reserva.split('-').reverse().join('/')} (${details.hora_inicio} às ${details.hora_fim})<br />
            🎾 <strong>Quadra:</strong> ${details.quadra_nome}
          </div>
          <p>O valor estornado será processado de acordo com o método original de pagamento. Em caso de dúvidas, fale com a recepção da arena.</p>
          <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 20px 0;" />
          <p style="font-size: 0.8em; color: #A0AEC0;">Esta é uma mensagem automática enviada por Arenix CourtManager em nome de ${arena ? arena.nome : 'sua Arena'}.</p>
        </div>
      `;
      await sendEmail(details.email, subject, html);
    }
  } catch (e) {
    console.error('[SMTP] Erro ao disparar e-mail de estorno:', e.message);
  }
}

const registrarEstorno = async (req, res) => {
  try {
    const { pagamento_id, reserva_id, valor, motivo, motivo_estorno } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.ip;
    const usuario = req.user;
    const descMotivo = motivo || motivo_estorno || 'Estorno parcial';

    if (usuario.perfil !== 'Administrador') {
      return res.status(403).json({ error: 'Apenas Administradores podem realizar estornos.' });
    }

    const target = await resolveEstornoTarget(req.user.tenant_id, pagamento_id, reserva_id);
    if (target.error) {
      return res.status(target.status).json({ error: target.error });
    }
    const { finalReservaId, maxEstornavel } = target;

    const saldoLiquidoQuery = await db.getAsync(`
      SELECT 
        COALESCE(SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END), 0) AS total_positivo,
        COALESCE(SUM(CASE WHEN valor < 0 THEN ABS(valor) ELSE 0 END), 0) AS total_negativo
      FROM Pagamentos 
      WHERE reserva_id = ?
    `, [finalReservaId]);

    const totalPositivo = saldoLiquidoQuery.total_positivo;
    const totalNegativo = saldoLiquidoQuery.total_negativo;
    const saldoDisponivelReserva = totalPositivo - totalNegativo;

    let limiteMaximo = saldoDisponivelReserva;
    if (pagamento_id && maxEstornavel < limiteMaximo) {
      limiteMaximo = maxEstornavel;
    }

    const valorEstornoInfo = valor !== undefined ? Number.parseFloat(valor) : limiteMaximo;
    if (Number.isNaN(valorEstornoInfo) || valorEstornoInfo <= 0) {
      return res.status(400).json({ error: 'O valor do estorno deve ser maior que zero.' });
    }

    if (valorEstornoInfo > limiteMaximo) {
      return res.status(400).json({ error: `O valor do estorno (R$ ${valorEstornoInfo.toFixed(2)}) não pode ser maior que o saldo disponível para estorno (R$ ${limiteMaximo.toFixed(2)}).` });
    }

    const valorEstornoNegativo = -Math.abs(valorEstornoInfo);
    await db.runAsync(
      'INSERT INTO Pagamentos (reserva_id, valor, metodo, registrado_por) VALUES (?, ?, ?, ?)',
      [finalReservaId, valorEstornoNegativo, 'Estorno', usuario.id]
    );

    const { saldoDevedor, novoStatus } = await atualizarStatusReserva(finalReservaId, req.user.tenant_id);
    logAuditEvent(usuario.id, 'Estorno Realizado', `Reserva: ${finalReservaId}, Valor: ${Math.abs(valorEstornoNegativo)}, Motivo: ${descMotivo}`, ip);

    dispararEmailEstorno(req.user.tenant_id, finalReservaId, valorEstornoInfo, descMotivo);

    res.json({
      message: 'Estorno realizado com sucesso.',
      saldo_devedor: saldoDevedor,
      status_pagamento: novoStatus
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao registrar estorno.' });
  }
};

// ─── RESUMO KPI ───────────────────────────────────────────────────────────────
const resumoPagamentos = async (req, res) => {
  try {
    const hoje = getTodayString();
    const tenant_id = req.user.tenant_id;
    const mes = hoje.substring(0, 7);
    const hora = getLocalTimeString();
    const dataFiltro = req.query.data ? req.query.data.trim() : null;

    // Recebido hoje (apenas reservas ativas/não canceladas)
    const recebidoHoje = await db.getAsync(
      `SELECT COALESCE(SUM(p.valor),0) as total, COUNT(CASE WHEN p.valor > 0 THEN 1 END) as qtd 
       FROM Pagamentos p 
       JOIN Reservas r ON p.reserva_id = r.id 
       WHERE DATE(p.registrado_em) = ? AND r.status != 'Cancelada' AND r.tenant_id = ?`,
      [hoje, tenant_id]);

    // Pendente hoje
    const pendenteHoje = await db.allAsync(
      `SELECT r.valor_total, COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id),0) as pago
       FROM Reservas r WHERE r.data_reserva = ? AND r.status != 'Cancelada' AND r.status_pagamento != 'Pago' AND r.tenant_id = ?`,
      [hoje, tenant_id]);
    const totalPendenteHoje = pendenteHoje.reduce((acc, r) => acc + Math.max(0, r.valor_total - r.pago), 0);

    // Recebido no mês (apenas reservas ativas/não canceladas)
    const recebidoMes = await db.getAsync(
      `SELECT COALESCE(SUM(p.valor),0) as total 
       FROM Pagamentos p 
       JOIN Reservas r ON p.reserva_id = r.id 
       WHERE strftime('%Y-%m', p.registrado_em) = ? AND r.status != 'Cancelada' AND r.tenant_id = ?`,
      [mes, tenant_id]);

    // Inadimplência global para o card
    const inadimplentes = await db.allAsync(
      `SELECT r.valor_total, COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id),0) as pago
       FROM Reservas r WHERE r.status != 'Cancelada' AND r.status_pagamento != 'Pago' AND r.tenant_id = ?`,
      [tenant_id]
    );
    const totalInadimplencia = inadimplentes.reduce((acc, r) => acc + Math.max(0, r.valor_total - r.pago), 0);

    // Contagens Globais para as Tabs
    const countPendentes = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND status_pagamento != 'Pago' AND tenant_id = ?`, [tenant_id]);
    const countPagos = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND status_pagamento = 'Pago' AND tenant_id = ?`, [tenant_id]);
    const countTodos = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND tenant_id = ?`, [tenant_id]);
    const countInadimplentes = await db.getAsync(`
      SELECT COUNT(*) as c FROM Reservas 
      WHERE status != 'Cancelada' AND status_pagamento != 'Pago' AND tenant_id = ?
      AND (data_reserva < ? OR (data_reserva = ? AND hora_fim < ?))
    `, [tenant_id, hoje, hoje, hora]);

    let resumoFiltrado = null;
    let countsFiltrados = {
      pendentes: countPendentes.c,
      pagos: countPagos.c,
      todos: countTodos.c,
      inadimplentes: countInadimplentes.c
    };

    if (dataFiltro) {
      // Recebido na data selecionada (apenas reservas ativas/não canceladas)
      const recebidoData = await db.getAsync(
        `SELECT COALESCE(SUM(p.valor),0) as total, COUNT(CASE WHEN p.valor > 0 THEN 1 END) as qtd 
         FROM Pagamentos p 
         JOIN Reservas r ON p.reserva_id = r.id 
         WHERE (DATE(p.registrado_em) = ? OR r.data_reserva = ?) AND r.status != 'Cancelada' AND r.tenant_id = ?`,
        [dataFiltro, dataFiltro, tenant_id]
      );

      // Pendente na data selecionada
      const pendenteData = await db.allAsync(
        `SELECT r.valor_total, COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id),0) as pago
         FROM Reservas r WHERE r.data_reserva = ? AND r.status != 'Cancelada' AND r.status_pagamento != 'Pago' AND r.tenant_id = ?`,
        [dataFiltro, tenant_id]
      );
      const totalPendenteData = pendenteData.reduce((acc, r) => acc + Math.max(0, r.valor_total - r.pago), 0);

      // Total faturado/agendado na data selecionada
      const faturamentoData = await db.getAsync(
        `SELECT COALESCE(SUM(valor_total),0) as total, COUNT(*) as qtd 
         FROM Reservas 
         WHERE data_reserva = ? AND status != 'Cancelada' AND tenant_id = ?`,
        [dataFiltro, tenant_id]
      );

      // Contagens na data selecionada
      const countPendData = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND status_pagamento != 'Pago' AND data_reserva = ? AND tenant_id = ?`, [dataFiltro, tenant_id]);
      const countPagData = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND status_pagamento = 'Pago' AND data_reserva = ? AND tenant_id = ?`, [dataFiltro, tenant_id]);
      const countTodosData = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND data_reserva = ? AND tenant_id = ?`, [dataFiltro, tenant_id]);
      const countInadData = await db.getAsync(`
        SELECT COUNT(*) as c FROM Reservas 
        WHERE status != 'Cancelada' AND status_pagamento != 'Pago' AND data_reserva = ? AND tenant_id = ?
        AND (data_reserva < ? OR (data_reserva = ? AND hora_fim < ?))
      `, [dataFiltro, tenant_id, hoje, hoje, hora]);

      countsFiltrados = {
        pendentes: countPendData.c,
        pagos: countPagData.c,
        todos: countTodosData.c,
        inadimplentes: countInadData.c
      };

      resumoFiltrado = {
        data: dataFiltro,
        recebido: recebidoData.total,
        qtdPagamentos: recebidoData.qtd,
        pendente: totalPendenteData,
        qtdPendente: pendenteData.length,
        faturamentoTotal: faturamentoData.total,
        totalReservas: faturamentoData.qtd,
        qtdInadimplentes: countInadData.c
      };
    }

    res.json({
      recebidoHoje: recebidoHoje.total,
      qtdPagamentosHoje: recebidoHoje.qtd,
      pendenteHoje: totalPendenteHoje,
      qtdPendenteHoje: pendenteHoje.length,
      recebidoMes: recebidoMes.total,
      totalInadimplencia,
      qtdInadimplentes: countInadimplentes.c,
      dataFiltro,
      resumoFiltrado,
      counts: countsFiltrados,
      countsGlobais: {
        pendentes: countPendentes.c,
        pagos: countPagos.c,
        todos: countTodos.c,
        inadimplentes: countInadimplentes.c
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar resumo de pagamentos.' });
  }
};

// ─── LISTAGEM DE RESERVAS COM PAGAMENTOS ─────────────────────────────────────
const listarReservasPagamentos = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const { status, busca, data } = req.query;

    let where = `r.tenant_id = ? AND r.status != 'Cancelada'`;
    const params = [tenant_id];

    if (status === 'Pendente') {
      where += ` AND r.status_pagamento IN ('Pendente', 'Parcial')`;
    } else if (status === 'Pago') {
      where += ` AND r.status_pagamento = 'Pago'`;
    } else if (status === 'inadimplentes') {
      // reservas cujo horário já passou e ainda não foram pagas
      const hoje = new Date().toISOString().split('T')[0];
      const tenant_id = req.user.tenant_id;
      const hora = new Date().toTimeString().substring(0, 5);
      where += ` AND r.status_pagamento != 'Pago'
                 AND (r.data_reserva < ? OR (r.data_reserva = ? AND r.hora_fim < ?))`;
      params.push(hoje, hoje, hora);
    }

    if (data) {
      where += ` AND r.data_reserva = ?`;
      params.push(data);
    }

    if (busca) {
      where += ` AND (c.nome LIKE ? OR CAST(r.id AS TEXT) LIKE ?)`;
      params.push(`%${busca}%`, `%${busca}%`);
    }

    const reservas = await db.allAsync(`
      SELECT
        r.id, r.data_reserva, r.hora_inicio, r.hora_fim,
        r.valor_total, r.status, r.status_pagamento,
        c.nome AS cliente_nome, c.telefone AS cliente_telefone,
        q.nome AS quadra_nome,
        COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id), 0) AS total_pago,
        COALESCE((SELECT GROUP_CONCAT(DISTINCT metodo) FROM Pagamentos WHERE reserva_id = r.id AND metodo != 'Estorno'), '') AS metodos
      FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      JOIN Quadras q ON r.quadra_id = q.id
      WHERE ${where}
      ORDER BY r.data_reserva DESC, r.hora_inicio DESC
    `, params);

    const comSaldo = reservas.map(r => ({
      ...r,
      saldo_devedor: Math.max(0, r.valor_total - r.total_pago)
    }));

    res.json(comSaldo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar reservas para pagamentos.' });
  }
};

module.exports = { registrarPagamento, aplicarDesconto, registrarEstorno, resumoPagamentos, listarReservasPagamentos };
