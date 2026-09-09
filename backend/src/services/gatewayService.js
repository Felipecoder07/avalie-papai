const db = require('../config/database');
const { sendEmail } = require('./emailService');
const crypto = require('crypto');

const atualizarStatusReservaInterna = async (reserva_id, tenant_id) => {
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

async function validarSegurançaLiquidacao(transacao, payload) {
  if (payload.valor_pago !== undefined && Math.abs(parseFloat(payload.valor_pago) - transacao.valor) > 0.01) {
    throw new Error('O valor pago na maquineta é divergente do saldo registrado na reserva.');
  }

  const reserva = await db.getAsync('SELECT tenant_id, status, status_pagamento FROM Reservas WHERE id = ?', [transacao.reserva_id]);
  if (reserva && payload.device_id !== undefined) {
    const arena = await db.getAsync('SELECT gateway_device_id FROM Arenas WHERE id = ?', [reserva.tenant_id]);
    if (!arena || arena.gateway_device_id !== payload.device_id) {
      throw new Error('Terminal de pagamento (device_id) físico inválido para esta Arena.');
    }
  }
  return reserva;
}

function resolverMetodoPagamentoGateway(metodo) {
  if (metodo === 'Cartao') return 'Cartão de Crédito Online';
  if (metodo === 'Maquineta') return 'Cartão (Maquineta)';
  return 'Pix Online';
}

async function atualizarStatusReservasAposLiquidacao(reserva, reservaId, tenantId) {
  const resFull = await db.getAsync('SELECT grupo_id FROM Reservas WHERE id = ?', [reservaId]);
  if (resFull?.grupo_id) {
    await db.runAsync(
      'UPDATE Reservas SET status = "Confirmada", status_pagamento = "Pago" WHERE grupo_id = ? AND tenant_id = ?',
      [resFull.grupo_id, tenantId]
    );
  } else if (reserva.status === 'Pendente') {
    await db.runAsync('UPDATE Reservas SET status = "Confirmada" WHERE id = ?', [reservaId]);
  }
}

async function enviarEmailComprovanteLiquidacao(reservaId, tenantId, transacaoValor, metodoPagamento, saldoDevedor, novoStatus) {
  try {
    const details = await db.getAsync(`
      SELECT r.id, r.data_reserva, r.hora_inicio, r.hora_fim, q.nome as quadra_nome, c.nome as cliente_nome, c.email
      FROM Reservas r
      JOIN Quadras q ON r.quadra_id = q.id
      JOIN Clientes c ON r.cliente_id = c.id
      WHERE r.id = ?
    `, [reservaId]);

    if (details?.email) {
      const arena = await db.getAsync('SELECT nome FROM Arenas WHERE id = ?', [tenantId]);
      const subject = 'Comprovante de Pagamento — Arenix 🎾';
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
          <h2 style="color: #2F855A; border-bottom: 2px solid #E2E8F0; padding-bottom: 10px;">Pagamento Confirmado! 💠</h2>
          <p>Olá, <strong>${details.cliente_nome}</strong>!</p>
          <p>Confirmamos o recebimento do seu pagamento online para a reserva <strong>#${details.id}</strong>.</p>
          <div style="background-color: #F7FAFC; border: 1px solid #E2E8F0; padding: 15px; border-radius: 5px; margin: 20px 0;">
            📅 <strong>Data:</strong> ${details.data_reserva.split('-').reverse().join('/')}<br />
            ⏰ <strong>Horário:</strong> ${details.hora_inicio} às ${details.hora_fim}<br />
            🎾 <strong>Quadra:</strong> ${details.quadra_nome}<br />
            💳 <strong>Método:</strong> ${metodoPagamento}<br />
            💵 <strong>Valor Pago:</strong> R$ ${transacaoValor.toFixed(2).replace('.', ',')}<br />
            📉 <strong>Saldo Devedor Restante:</strong> R$ ${saldoDevedor.toFixed(2).replace('.', ',')}<br />
            📊 <strong>Status do Pagamento:</strong> ${novoStatus === 'Pago' ? 'Pago (Quitado) ✅' : 'Pagamento Parcial ⚠️'}
          </div>
          <p>Bom jogo!</p>
          <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 20px 0;" />
          <p style="font-size: 0.8em; color: #A0AEC0;">Esta é uma mensagem automática enviada por Arenix CourtManager em nome de ${arena ? arena.nome : 'sua Arena'}.</p>
        </div>
      `;
      await sendEmail(details.email, subject, html);
    }
  } catch (e) {
    console.error('[SMTP] Erro ao disparar e-mail de recibo no gateway:', e.message);
  }
}

const processarLiquidacao = async (gateway_ref, payload = {}) => {
  const transacao = await db.getAsync('SELECT * FROM TransacoesGateway WHERE gateway_ref = ?', [gateway_ref]);
  if (!transacao) {
    throw new Error('Transação não encontrada.');
  }

  if (transacao.status === 'Pago') {
    return { status: 'already_paid', reserva_id: transacao.reserva_id };
  }

  const reserva = await validarSegurançaLiquidacao(transacao, payload);

  await db.runAsync('UPDATE TransacoesGateway SET status = "Pago", atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [transacao.id]);

  const metodoPagamento = resolverMetodoPagamentoGateway(transacao.metodo);
  
  await db.runAsync(`
    INSERT INTO Pagamentos (reserva_id, valor, metodo, registrado_por)
    VALUES (?, ?, ?, NULL)
  `, [transacao.reserva_id, transacao.valor, metodoPagamento]);

  if (reserva) {
    await atualizarStatusReservasAposLiquidacao(reserva, transacao.reserva_id, reserva.tenant_id);
    const { saldoDevedor, novoStatus } = await atualizarStatusReservaInterna(transacao.reserva_id, reserva.tenant_id);
    enviarEmailComprovanteLiquidacao(transacao.reserva_id, reserva.tenant_id, transacao.valor, metodoPagamento, saldoDevedor, novoStatus);
  }

  return { status: 'success', reserva_id: transacao.reserva_id };
};

/**
 * Retorna o access_token ESPECÍFICO da arena (conectado via OAuth).
 * NUNCA retorna o token do master/SaaS — isso evita que pagamentos de clientes
 * da arena caiam na conta errada (bug crítico de multi-tenancy).
 * Se a arena não conectou sua conta MP → retorna null → cai no simulador.
 */
const obterTokenGatewayArena = async (tenant_id) => {
  if (!tenant_id) return null;
  const arena = await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id = ?', [tenant_id]);
  if (arena && arena.gateway_access_token && arena.gateway_access_token.trim() !== '') {
    return arena.gateway_access_token.trim();
  }
  // Não fazer fallback para token do master — cada arena usa apenas a própria conta
  return null;
};

const { gerarPixEMV } = require('../utils/pixPayload');

const criarCobrancaPix = async (reserva_id, valor, tenant_id) => {
  const token = await obterTokenGatewayArena(tenant_id);

  // Sem token = verificar se a arena possui chave Pix cadastrada para gerar QR Code direto
  if (!token) {
    const arena = await db.getAsync('SELECT nome, chave_pix, titular_pix, cidade_pix FROM Arenas WHERE id = ?', [tenant_id]);
    if (arena && arena.chave_pix && arena.chave_pix.trim() !== '') {
      const chavePix = arena.chave_pix.trim();
      const titular = arena.titular_pix || arena.nome || 'Arena';
      const cidade = arena.cidade_pix || 'SAO PAULO';

      const copiaCola = gerarPixEMV({
        chave: chavePix,
        nome: titular,
        cidade: cidade,
        valor: valor,
        txid: `RESERVA${reserva_id}`
      });

      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(copiaCola)}`;

      return {
        qr_code: qrCodeUrl,
        copia_cola: copiaCola,
        gateway_ref: `PIX_ESTATICO_${reserva_id}`,
        is_estatico: true
      };
    }

    throw new Error(
      'Esta arena ainda não configurou uma chave Pix ou conta Mercado Pago. ' +
      'Acesse Configurações → Pagamentos para cadastrar sua chave Pix.'
    );
  }

  try {
    const idempotencyKey = crypto.randomBytes(16).toString('hex');

    const details = await db.getAsync(`
      SELECT c.email, c.nome FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      WHERE r.id = ?
    `, [reserva_id]);

    const clientEmail = details ? details.email : 'cliente@arenix.com';
    const clientName  = details ? details.nome.split(' ') : ['Cliente', 'Arenix'];

    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        transaction_amount: parseFloat(valor.toFixed(2)),
        description: `Reserva #${reserva_id} no Arenix`,
        payment_method_id: 'pix',
        payer: {
          email: clientEmail,
          first_name: clientName[0],
          last_name: clientName.slice(1).join(' ') || 'Silva'
        }
      })
    });

    if (response.ok) {
      const mpData = await response.json();
      const txRef = String(mpData.id);

      await db.runAsync(`
        INSERT INTO TransacoesGateway (reserva_id, gateway_ref, valor, status, metodo)
        VALUES (?, ?, ?, 'Pendente', 'Pix')
      `, [reserva_id, txRef, valor]);

      return {
        qr_code_base64: mpData.point_of_interaction.transaction_data.qr_code_base64,
        qr_code: `data:image/png;base64,${mpData.point_of_interaction.transaction_data.qr_code_base64}`,
        copia_cola: mpData.point_of_interaction.transaction_data.qr_code,
        gateway_ref: txRef
      };
    } else {
      const errData = await response.json();
      const safeMsg = String(errData?.message || (errData?.cause && errData.cause[0] ? errData.cause[0].description : 'Credenciais inválidas')).replace(/[\r\n]/g, '');
      console.error(`[Mercado Pago API Error] ${safeMsg}`);
      throw new Error(`Mercado Pago: ${safeMsg}`);
    }
  } catch (e) {
    if (e.message && e.message.startsWith('Mercado Pago:')) throw e;
    throw new Error(`Erro ao gerar cobrança Pix: ${e.message}`);
  }
};


const criarCobrancaCartao = async (reserva_id, valor, card_data, tenant_id) => {
  const token = await obterTokenGatewayArena(tenant_id);

  if (!token) {
    throw new Error(
      'Esta arena ainda não conectou uma conta Mercado Pago. ' +
      'Acesse Configurações → Pagamentos e clique em "Conectar com Mercado Pago" para habilitar pagamentos com cartão.'
    );
  }

  if (!card_data || !card_data.token) {
    throw new Error('Dados do cartão inválidos ou não fornecidos.');
  }

  try {
    const idempotencyKey = crypto.randomBytes(16).toString('hex');

    const details = await db.getAsync(`
      SELECT c.email FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      WHERE r.id = ?
    `, [reserva_id]);

    const clientEmail = details ? details.email : 'cliente@arenix.com';

    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        transaction_amount: parseFloat(valor.toFixed(2)),
        token: card_data.token,
        description: `Reserva #${reserva_id} no Arenix`,
        installments: 1,
        payment_method_id: card_data.payment_method_id,
        payer: { email: clientEmail }
      })
    });

    if (response.ok) {
      const mpData = await response.json();
      const txRef = String(mpData.id);

      await db.runAsync(`
        INSERT INTO TransacoesGateway (reserva_id, gateway_ref, valor, status, metodo)
        VALUES (?, ?, ?, 'Pendente', 'Cartao')
      `, [reserva_id, txRef, valor]);

      if (mpData.status === 'approved') {
        await processarLiquidacao(txRef);
        return { status: 'approved', gateway_ref: txRef };
      }
      return { status: mpData.status, gateway_ref: txRef };
    } else {
      const errData = await response.json();
      throw new Error(errData.message || 'Erro ao processar pagamento com cartão.');
    }
  } catch (e) {
    console.error('[Mercado Pago Cartao Exception]', e);
    throw new Error(e.message || 'Erro ao processar pagamento com cartão.');
  }
};


const criarCobrancaMaquineta = async (reserva_id, valor, tenant_id) => {
  const arena = await db.getAsync('SELECT gateway_device_id FROM Arenas WHERE id = ?', [tenant_id]);

  if (!arena || !arena.gateway_device_id) {
    throw new Error('Terminal de cartão físico (maquineta) não configurado para esta Arena. Configure o Serial Number nas Configurações → Pagamentos.');
  }

  const deviceId = arena.gateway_device_id;
  const token = await obterTokenGatewayArena(tenant_id);

  if (!token) {
    throw new Error(
      'Esta arena ainda não conectou uma conta Mercado Pago. ' +
      'Acesse Configurações → Pagamentos e clique em "Conectar com Mercado Pago" para habilitar a maquineta.'
    );
  }

  try {
    const idempotencyKey = crypto.randomBytes(16).toString('hex');

    const response = await fetch(`https://api.mercadopago.com/v1/devices/${deviceId}/point-integration-api/payment-intents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        amount: parseFloat(valor.toFixed(2)),
        description: `Reserva #${reserva_id} no Arenix`,
        payment: { installments: 1, type: 'credit_card' }
      })
    });

    if (response.ok) {
      const mpData = await response.json();
      const txRef = String(mpData.id);

      await db.runAsync(`
        INSERT INTO TransacoesGateway (reserva_id, gateway_ref, valor, status, metodo)
        VALUES (?, ?, ?, 'Pendente', 'Maquineta')
      `, [reserva_id, txRef, valor]);

      return { status: 'pending', gateway_ref: txRef, device_id: deviceId };
    } else {
      const errData = await response.json();
      const safeMsg = String(errData?.message || 'Erro ao enviar intenção para a maquineta.').replace(/[\r\n]/g, '');
      console.error(`[Mercado Pago Point Cloud API Error] ${safeMsg}`);
      throw new Error(safeMsg);
    }
  } catch (e) {
    console.error('[Mercado Pago Point Cloud Exception]', e);
    throw new Error(e.message || 'Erro de rede ao conectar com a maquineta.');
  }
};

const estornarPagamentoPix = async (reserva_id, tenant_id) => {
  const token = await obterTokenGatewayArena(tenant_id);
  if (!token) return { success: false, reason: 'no_gateway_token' };

  const tx = await db.getAsync(`
    SELECT gateway_ref, status FROM TransacoesGateway
    WHERE reserva_id = ? AND (status = 'Aprovado' OR status = 'Pago')
    ORDER BY id DESC LIMIT 1
  `, [reserva_id]);

  if (!tx || !tx.gateway_ref) {
    return { success: false, reason: 'no_approved_transaction' };
  }

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${tx.gateway_ref}/refunds`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      await db.runAsync(`
        UPDATE TransacoesGateway SET status = 'Estornado', atualizado_em = CURRENT_TIMESTAMP
        WHERE gateway_ref = ?
      `, [tx.gateway_ref]);

      return { success: true, gateway_ref: tx.gateway_ref };
    } else {
      const errData = await response.json();
      const safeMsg = String(errData?.message || 'Falha ao estornar pagamento').replace(/[\r\n]/g, '');
      console.error(`[Mercado Pago Refund Error] ${safeMsg}`);
      return { success: false, reason: 'api_error', details: { message: safeMsg } };
    }
  } catch (err) {
    console.error('[Mercado Pago Refund Exception]', err);
    return { success: false, reason: 'exception', error: err.message };
  }
};

module.exports = {
  criarCobrancaPix,
  criarCobrancaCartao,
  criarCobrancaMaquineta,
  processarLiquidacao,
  estornarPagamentoPix
};

