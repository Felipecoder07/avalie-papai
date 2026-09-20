const logger = require('../utils/safeLogger').forModule('gatewayService');
const { fetch } = require('../utils/providerHttp');
const db = require('../config/database');
const { sendEmail } = require('./emailService');
const crypto = require("node:crypto");

const processarLiquidacao = require('./paymentLedgerService').settle;

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
    return require('../utils/security').decrypt(arena.gateway_access_token.trim());
  }
  // Não fazer fallback para token do master — cada arena usa apenas a própria conta
  return null;
};

const { gerarPixEMV } = require('../utils/pixPayload');

const criarCobrancaPixRaw = async (reserva_id, valor, tenant_id, intentKey) => {
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
        // The ledger and gateway service use centavos; the EMV helper accepts reais.
        valor: valor / 100,
        txid: `RESERVA${reserva_id}`
      });

      const qrCodeUrl = await require('qrcode').toDataURL(copiaCola);

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
    const idempotencyKey = intentKey;

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
        transaction_amount: Number.parseFloat((valor / 100).toFixed(2)),
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
        INSERT OR IGNORE INTO TransacoesGateway (reserva_id, gateway_ref, valor, status, metodo)
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
      const safeMsg = 'O provedor não autorizou a cobrança.';
      logger.error(`[Mercado Pago API Error] ${safeMsg}`);
      throw new Error(`Mercado Pago: ${safeMsg}`);
    }
  } catch (e) {
    if (e.message && e.message.startsWith('Mercado Pago:')) throw e;
    throw new Error(`Erro ao gerar cobrança Pix: ${e.message}`);
  }
};


const criarCobrancaCartaoRaw = async (reserva_id, valor, card_data, tenant_id, intentKey) => {
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
    const idempotencyKey = intentKey;

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
        transaction_amount: Number.parseFloat((valor / 100).toFixed(2)),
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
        INSERT OR IGNORE INTO TransacoesGateway (reserva_id, gateway_ref, valor, status, metodo)
        VALUES (?, ?, ?, 'Pendente', 'Cartao')
      `, [reserva_id, txRef, valor]);

      if (mpData.status === 'approved') {
        await processarLiquidacao(txRef);
        return { status: 'approved', gateway_ref: txRef };
      }
      return { status: mpData.status, gateway_ref: txRef };
    } else {
      const errData = await response.json();
      throw new Error('Erro ao processar pagamento com cartão.');
    }
  } catch (e) {
    logger.error('[Mercado Pago Cartao Exception]', e);
    throw new Error('Erro ao processar pagamento com cartão.');
  }
};


const criarCobrancaMaquinetaRaw = async (reserva_id, valor, tenant_id, intentKey) => {
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
    const idempotencyKey = intentKey;

    const response = await fetch(`https://api.mercadopago.com/v1/devices/${deviceId}/point-integration-api/payment-intents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        amount: Number.parseFloat((valor / 100).toFixed(2)),
        description: `Reserva #${reserva_id} no Arenix`,
        payment: { installments: 1, type: 'credit_card' }
      })
    });

    if (response.ok) {
      const mpData = await response.json();
      const txRef = String(mpData.id);

      await db.runAsync(`
        INSERT OR IGNORE INTO TransacoesGateway (reserva_id, gateway_ref, valor, status, metodo)
        VALUES (?, ?, ?, 'Pendente', 'Maquineta')
      `, [reserva_id, txRef, valor]);

      return { status: 'pending', gateway_ref: txRef, device_id: deviceId };
    } else {
      const errData = await response.json();
      const safeMsg = 'O provedor não autorizou a cobrança.';
      logger.error(`[Mercado Pago Point Cloud API Error] ${safeMsg}`);
      throw new Error(safeMsg);
    }
  } catch (e) {
    logger.error('[Mercado Pago Point Cloud Exception]', e);
    throw new Error(e.message || 'Erro de rede ao conectar com a maquineta.');
  }
};

const estornarPagamentoPix=async(reserva_id,tenant_id)=>{
 const token=await obterTokenGatewayArena(tenant_id);
 if(!token) return {success:false,reason:'no_gateway_token'};
 const {ensureSecuritySchema}=require('../config/securitySchema');await ensureSecuritySchema(db);
 const reservation=await db.getAsync('SELECT * FROM Reservas WHERE id=? AND tenant_id=?',[reserva_id,tenant_id]);
 if(!reservation) return {success:false,reason:'not_found'};
 const rows=await db.allAsync("SELECT t.* FROM TransacoesGateway t JOIN Reservas r ON r.id=t.reserva_id WHERE r.tenant_id=? AND (r.id=? OR r.grupo_id=?) AND t.status IN ('Pago','Aprovado')",[tenant_id,reserva_id,reservation.grupo_id]);
 if(!rows.length) return {success:false,reason:'no_approved_transaction'};
 for(const tx of rows){
  const selected=await db.transaction(async()=>{
   const credit=await db.getAsync('SELECT * FROM GatewayCredits WHERE gateway_ref=?',[tx.gateway_ref]);
   if(!credit) return null;
   const prior=await db.getAsync("SELECT amount_cents FROM RefundIntents WHERE id=?",['provider:'+tx.gateway_ref]);
   const amount=credit.amount_cents-(prior?.amount_cents||0);
   if(amount<=0) return {done:true};
   const open=await db.getAsync("SELECT * FROM RefundIntents WHERE gateway_ref=? AND state IN ('pending','unknown')",[tx.gateway_ref]);
   if(open){
    if(open.state==='pending'&&Date.now()-open.created<30000)return {busy:true};
    await db.runAsync("UPDATE RefundIntents SET state='pending',created=? WHERE id=?",[Date.now(),open.id]);
    return {id:open.id,amount:open.amount_cents,total:credit.amount_cents};
   }
   const id=require('../utils/security').secret();
   await db.runAsync("INSERT INTO RefundIntents(id,gateway_ref,amount_cents,state,created) VALUES(?,?,?,'pending',?)",[id,tx.gateway_ref,amount,Date.now()]);
   return {id,amount,total:credit.amount_cents};
  });
  if(!selected||selected.busy) return {success:false,reason:'pending_reconciliation'};
  if(selected.done) continue;
  try{
   const response=await fetch('https://api.mercadopago.com/v1/payments/'+encodeURIComponent(tx.gateway_ref)+'/refunds',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Idempotency-Key':selected.id},body:JSON.stringify({amount:selected.amount/100})});
   const refund=await response.json();
   if(!response.ok||refund.status!=='approved'||require('../utils/security').cents(refund.amount)!==selected.amount) throw new Error('Refund unconfirmed');
   await require('./paymentLedgerService').reverse(tx.gateway_ref,selected.total);
   await db.runAsync("UPDATE RefundIntents SET state='completed',response_json=? WHERE id=?",[JSON.stringify({id:refund.id,status:refund.status}),selected.id]);
  }catch(e){
   await db.runAsync("UPDATE RefundIntents SET state='unknown' WHERE id=?",[selected.id]);
   return {success:false,reason:'pending_reconciliation'};
  }
 }
 return {success:true};
};

const {withIntent}=require('./paymentIntentService');
const criarCobrancaPix=(id,valor,tenant)=>withIntent('Pix',id,valor,tenant,key=>criarCobrancaPixRaw(id,valor,tenant,key));
const criarCobrancaCartao=(id,valor,card,tenant)=>withIntent('Cartao',id,valor,tenant,key=>criarCobrancaCartaoRaw(id,valor,card,tenant,key));
const criarCobrancaMaquineta=(id,valor,tenant)=>withIntent('Maquineta',id,valor,tenant,key=>criarCobrancaMaquinetaRaw(id,valor,tenant,key));
async function resolverContextoWebhookMercadoPago(paymentId) {
  const tx = await db.getAsync(`
    SELECT t.gateway_ref, t.reserva_id, t.valor, r.tenant_id,
           a.gateway_access_token, a.gateway_user_id,
           i.id AS intent_id, i.amount_cents AS intent_amount_cents,
           i.tenant_id AS intent_tenant_id, i.reserva_id AS intent_reserva_id,
           i.state AS intent_state
    FROM TransacoesGateway t
    JOIN Reservas r ON r.id = t.reserva_id
    JOIN Arenas a ON a.id = r.tenant_id
    LEFT JOIN PaymentIntents i ON i.gateway_ref = t.gateway_ref
    WHERE t.gateway_ref = ?
  `, [paymentId]);
  if (!tx?.gateway_access_token?.trim() || !tx.gateway_user_id || !tx.intent_id ||
      Number(tx.intent_amount_cents) !== Number(tx.valor) ||
      Number(tx.intent_tenant_id) !== Number(tx.tenant_id) ||
      Number(tx.intent_reserva_id) !== Number(tx.reserva_id)) return null;
  return { ...tx, token: require('../utils/security').decrypt(tx.gateway_access_token.trim()) };
}

async function liquidarWebhookMercadoPago(paymentId, context) {
  if (!context || !paymentId) return;
  const safePaymentId = String(paymentId).trim();
  if (!/^\d+$/.test(safePaymentId)) return;
  const encodedPaymentId = encodeURIComponent(safePaymentId);

  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodedPaymentId}`, {
    headers: { 'Authorization': `Bearer ${context.token}` }
  });
  if (!mpRes.ok && (mpRes.status === 429 || mpRes.status >= 500)) {
    throw new Error('Consulta temporariamente indisponível no provedor de pagamentos.');
  }
  if (mpRes.ok) {
    const mpData = await mpRes.json();
    if (String(mpData.id) !== safePaymentId || mpData.currency_id !== 'BRL' ||
        !Number.isFinite(Number(mpData.transaction_amount)) ||
        require('../utils/security').cents(mpData.transaction_amount) !== Number(context.valor) ||
        String(mpData.collector_id) !== String(context.gateway_user_id)) {
      logger.warn('[Gateway Webhook] Pagamento consultado diverge da transação/intenção; crédito bloqueado.');
      return;
    }
    if (['refunded','charged_back'].includes(mpData.status) || Number(mpData.transaction_amount_refunded)>0) { await require('./paymentLedgerService').reverse(safePaymentId, Math.round((mpData.transaction_amount_refunded || mpData.transaction_amount) * 100)); return; }
    if (mpData.status === 'approved') {
      const payload = {};
      if (mpData.pos_id) payload.device_id = mpData.pos_id;
      if (mpData.transaction_amount) payload.valor_pago = Math.round(mpData.transaction_amount * 100);
      await processarLiquidacao(safePaymentId, payload);
    }
  }
}

module.exports = {
  criarCobrancaPix,
  criarCobrancaCartao,
  criarCobrancaMaquineta,
  processarLiquidacao,
  estornarPagamentoPix,
  resolverContextoWebhookMercadoPago,
  liquidarWebhookMercadoPago
};
