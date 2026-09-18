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
        valor: valor,
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
        transaction_amount: Number.parseFloat(valor.toFixed(2)),
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
      const safeMsg = String(errData?.message || (errData?.cause && errData.cause[0] ? errData.cause[0].description : 'Credenciais inválidas')).replace(/[\r\n]/g, '');
      console.error(`[Mercado Pago API Error] ${safeMsg}`);
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
        transaction_amount: Number.parseFloat(valor.toFixed(2)),
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
      throw new Error(errData.message || 'Erro ao processar pagamento com cartão.');
    }
  } catch (e) {
    console.error('[Mercado Pago Cartao Exception]', e);
    throw new Error(e.message || 'Erro ao processar pagamento com cartão.');
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
        amount: Number.parseFloat(valor.toFixed(2)),
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
      const safeMsg = String(errData?.message || 'Erro ao enviar intenção para a maquineta.').replace(/[\r\n]/g, '');
      console.error(`[Mercado Pago Point Cloud API Error] ${safeMsg}`);
      throw new Error(safeMsg);
    }
  } catch (e) {
    console.error('[Mercado Pago Point Cloud Exception]', e);
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
   await require('./paymentLedgerService').reverse(tx.gateway_ref,selected.total/100);
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
module.exports = {
  criarCobrancaPix,
  criarCobrancaCartao,
  criarCobrancaMaquineta,
  processarLiquidacao,
  estornarPagamentoPix
};

