/**
 * saasBillingService.js
 * Serviço responsável por toda a lógica de cobrança de mensalidades do SaaS.
 *
 * SEPARAÇÃO DE FLUXOS (CRÍTICO):
 *   - Pagamentos dos CLIENTES das arenas  → Conta MP da Arena (gateway_access_token via OAuth)
 *   - Pagamentos das MENSALIDADES do SaaS → Conta MP do Master (mp_master_access_token em ConfiguracoesSaaS)
 *
 * Funções exportadas:
 *   getMasterAccessToken()          — Lê o access_token pessoal do Master do banco
 *   gerarPixFaturaSaaS(faturaId)    — Gera (ou reutiliza) o Pix de uma fatura de mensalidade
 *   liquidarFaturaSaaS(gatewayRef)  — Liquida a fatura e desbloqueia a arena automaticamente (idempotente)
 *   enviarAvisosVencimento()        — Envia e-mails de aviso de vencimento próximo (cron diário)
 */

const crypto = require("node:crypto");
const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');
const { gerarPixEMV } = require('../utils/pixPayload');
const { sendEmail } = require('./emailService');

// ─────────────────────────────────────────────────────────────────────────────
// 1. OBTER ACCESS TOKEN DO MASTER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna o access_token pessoal da conta Mercado Pago do SaaS Master.
 * Este token é usado EXCLUSIVAMENTE para gerar cobranças de mensalidades.
 * É diferente do mp_client_id/secret (usados para OAuth dos tenants).
 * @returns {Promise<string|null>}
 */
const getMasterAccessToken = async () => {
  const row = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'mp_master_access_token'");
  if (row && row.valor && row.valor.trim() !== '') {
    return row.valor.trim();
  }
  if (process.env.MERCADO_PAGO_ACCESS_TOKEN && process.env.MERCADO_PAGO_ACCESS_TOKEN.trim() !== '') {
    return process.env.MERCADO_PAGO_ACCESS_TOKEN.trim();
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GERAR PIX DE FATURA DE MENSALIDADE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gera (ou reutiliza se ainda válido) o QR Code Pix para pagamento de uma fatura de mensalidade.
 * - Se já existe um Pix não expirado para esta fatura → reutiliza.
 * - Se não existe ou está expirado → gera um novo via API do Mercado Pago (ou fallback EMV em dev).
 *
 * @param {number} faturaId
 * @returns {Promise<{qr_code: string, copia_cola: string, gateway_ref: string, expira_em: string}>}
 */
const gerarPixFaturaSaaS = async (faturaId) => {
  // 1. Verificar se a fatura existe e está em aberto
  const fatura = await db.getAsync(`
    SELECT f.*, a.nome as arena_nome, a.email as arena_email
    FROM FaturasSaaS f
    JOIN Arenas a ON f.tenant_id = a.id
    WHERE f.id = ?
  `, [faturaId]);

  if (!fatura) {
    throw new Error(`Fatura #${faturaId} não encontrada.`);
  }
  if (fatura.status === 'Paga') {
    throw new Error(`Fatura #${faturaId} já está paga.`);
  }

  // 2. Reutilizar Pix existente se ainda válido (não expirado)
  if (fatura.gateway_ref && fatura.qr_expira_em) {
    const agora = new Date();
    const expiracao = new Date(fatura.qr_expira_em);
    if (agora < expiracao) {
      const fallbackQr = fatura.copia_cola 
        ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(fatura.copia_cola)}` 
        : null;
      return {
        qr_code: fallbackQr,
        copia_cola: fatura.copia_cola,
        gateway_ref: fatura.gateway_ref,
        expira_em: fatura.qr_expira_em,
        reutilizado: true,
      };
    }
  }

  // 3. Obter Access Token do Master
  const token = await getMasterAccessToken();
  const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  const expiraEmISO = expiraEm.toISOString();

  // Se estiver em ambiente de teste ou não há token do MP configurado ou o token não é válido, usa gerador de Pix EMV local (Dev/Sandbox/Test)
  if (process.env.NODE_ENV === 'test' || !token || (!token.startsWith('APP_USR-') && !token.startsWith('TEST-'))) {
    const copiaCola = gerarPixEMV({
      chave: 'financeiro@arenix.com.br',
      nome: 'Arenix SaaS Master',
      cidade: 'SAO PAULO',
      valor: fatura.valor,
      txid: `SAAS${fatura.id}`
    }) || `00020101021226580014BR.GOV.BCB.PIX0114financeiro@arenix520400005303986540${fatura.valor.toFixed(2)}5802BR5916Arenix SaaS6009SAO PAULO62070503***6304`;

    const gatewayRef = fatura.gateway_ref || `SIM_SAAS_FATURA_${fatura.id}_${Date.now()}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(copiaCola)}`;

    await db.runAsync(`
      UPDATE FaturasSaaS
      SET gateway_ref     = ?,
          copia_cola      = ?,
          qr_expira_em    = ?,
          metodo_pagamento = 'Pix Online'
      WHERE id = ?
    `, [gatewayRef, copiaCola, expiraEmISO, faturaId]);

    logAuditEvent(0, 'SaaS Billing: Pix Gerado (Dev/EMV)',
      `Pix de R$${fatura.valor.toFixed(2)} gerado para Fatura #${faturaId} (Arena: ${fatura.arena_nome})`, '127.0.0.1');

    return {
      qr_code: qrCodeUrl,
      copia_cola: copiaCola,
      gateway_ref: gatewayRef,
      expira_em: expiraEmISO,
      reutilizado: false,
    };
  }

  // 4. Gerar novo QR Code Pix via API do Mercado Pago
  const idempotencyKey = crypto.randomBytes(16).toString('hex');

  const response = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      transaction_amount: Number.parseFloat(fatura.valor.toFixed(2)),
      description: `Mensalidade SaaS Arenix — ${fatura.arena_nome} (Fatura #${fatura.id})`,
      payment_method_id: 'pix',
      date_of_expiration: expiraEmISO,
      payer: {
        email: fatura.arena_email || 'arena@arenix.com.br',
        first_name: fatura.arena_nome.split(' ')[0],
        last_name: fatura.arena_nome.split(' ').slice(1).join(' ') || 'Arena',
      },
      metadata: {
        fatura_saas_id: fatura.id,
        tenant_id: fatura.tenant_id,
        origem: 'saas_billing',
      },
    }),
  });

  if (!response.ok) {
    const errData = await response.json();
    const detalhe = errData.message || (errData.cause?.[0]?.description) || 'Erro desconhecido';
    throw new Error(`Mercado Pago: ${detalhe}`);
  }

  const mpData = await response.json();
  const gatewayRef = String(mpData.id);
  const copiaCola = mpData.point_of_interaction?.transaction_data?.qr_code || '';
  const qrCodeBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64 || '';

  // 5. Persistir os dados do Pix na fatura (para reutilização e polling)
  await db.runAsync(`
    UPDATE FaturasSaaS
    SET gateway_ref     = ?,
        copia_cola      = ?,
        qr_expira_em    = ?,
        metodo_pagamento = 'Pix Online'
    WHERE id = ?
  `, [gatewayRef, copiaCola, expiraEmISO, faturaId]);

  logAuditEvent(0, 'SaaS Billing: Pix Gerado',
    `Pix de R$${fatura.valor.toFixed(2)} gerado para Fatura #${faturaId} (Arena: ${fatura.arena_nome})`, '127.0.0.1');

  return {
    qr_code: qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : null,
    copia_cola: copiaCola,
    gateway_ref: gatewayRef,
    expira_em: expiraEmISO,
    reutilizado: false,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. LIQUIDAR FATURA (IDEMPOTENTE) + AUTO-DESBLOQUEIO DA ARENA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Liquida uma fatura de mensalidade SaaS pelo gateway_ref do Mercado Pago.
 * Esta função é IDEMPOTENTE — chamá-la duas vezes para o mesmo gateway_ref
 * não produz efeitos duplicados.
 *
 * @param {string} gatewayRef — ID do pagamento no Mercado Pago
 * @returns {Promise<{sucesso: boolean, mensagem: string, fatura_id?: number, arena_desbloqueada?: boolean}>}
 */
const liquidarFaturaSaaS = async (gatewayRef) => {
  const fatura = await db.getAsync(`
    SELECT f.*, a.status as arena_status, a.nome as arena_nome
    FROM FaturasSaaS f
    JOIN Arenas a ON f.tenant_id = a.id
    WHERE f.gateway_ref = ?
  `, [gatewayRef]);

  if (!fatura) {
    const safeRef = String(gatewayRef || '').replace(/[\r\n]/g, '');
    console.warn(`[SaaS Billing] Webhook recebido para gateway_ref desconhecido: ${safeRef}`);
    return { sucesso: false, mensagem: `Fatura com gateway_ref ${safeRef} não encontrada.` };
  }

  // IDEMPOTÊNCIA: já processado → não faz nada
  if (fatura.status === 'Paga') {
    console.log(`[SaaS Billing] Fatura #${fatura.id} já estava paga. Webhook ignorado (idempotente).`);
    return { sucesso: true, mensagem: 'Fatura já estava paga.', fatura_id: fatura.id, arena_desbloqueada: false };
  }

  const hoje = new Date().toISOString().split('T')[0];

  // Marcar fatura como Paga
  await db.runAsync(`
    UPDATE FaturasSaaS
    SET status = 'Paga', data_pagamento = ?
    WHERE id = ?
  `, [hoje, fatura.id]);

  let arenaDesbloqueada = false;

  // Auto-desbloqueio: se arena estava suspensa por inadimplência → reativar
  if (fatura.arena_status === 0) {
    await db.runAsync('UPDATE Arenas SET status = 1 WHERE id = ?', [fatura.tenant_id]);
    arenaDesbloqueada = true;
    console.log(`[SaaS Billing] Arena '${fatura.arena_nome}' (ID: ${fatura.tenant_id}) reativada após pagamento da Fatura #${fatura.id}.`);
  }

  // Auto-upgrade de plano e ciclo: se a fatura paga for de um novo plano/ciclo contratado → atualizar arena
  const arenaAtual = await db.getAsync('SELECT plano_id, ciclo_cobranca, status, nome FROM Arenas WHERE id = ?', [fatura.tenant_id]);
  let planoAtualizado = false;
  const novoCiclo = fatura.ciclo || 'mensal';
  if (arenaAtual && (Number(arenaAtual.plano_id) !== Number(fatura.plano_id) || (arenaAtual.ciclo_cobranca || 'mensal') !== novoCiclo)) {
    await db.runAsync('UPDATE Arenas SET plano_id = ?, ciclo_cobranca = ? WHERE id = ?', [fatura.plano_id, novoCiclo, fatura.tenant_id]);
    planoAtualizado = true;
    console.log(`[SaaS Billing] Arena '${fatura.arena_nome}' (ID: ${fatura.tenant_id}) atualizada para o Plano ID ${fatura.plano_id} (Ciclo: ${novoCiclo}) após pagamento da Fatura #${fatura.id}.`);
  }

  logAuditEvent(0, 'SaaS Billing: Fatura Liquidada',
    `Fatura #${fatura.id} paga via Pix Online (ref: ${gatewayRef}). Arena ${arenaDesbloqueada ? 'REATIVADA' : 'já ativa'}.${planoAtualizado ? ` Plano atualizado para ID ${fatura.plano_id} (${novoCiclo}).` : ''}`,
    '127.0.0.1');

  return {
    sucesso: true,
    mensagem: arenaDesbloqueada
      ? `Fatura #${fatura.id} paga. Arena '${fatura.arena_nome}' reativada com sucesso.`
      : `Fatura #${fatura.id} paga com sucesso.`,
    fatura_id: fatura.id,
    arena_desbloqueada: arenaDesbloqueada,
    plano_atualizado: planoAtualizado,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. ENVIAR AVISOS DE VENCIMENTO (CRON DIÁRIO)
// ─────────────────────────────────────────────────────────────────────────────

const formatarDataBR = (dataStr) => {
  if (!dataStr) return '-';
  const parts = dataStr.split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dataStr;
};

const gerarHtmlAvisoVencimento = (fatura) => {
  const dataFormatada = formatarDataBR(fatura.data_vencimento);
  const valorFormatado = Number(fatura.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <div style="background-color: #0f172a; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">Arenix CourtManager</h1>
        <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 13px;">Gestão Inteligente de Arenas Esportivas</p>
      </div>
      <div style="padding: 32px 24px;">
        <div style="display: inline-block; background-color: #fef3c7; color: #92400e; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-bottom: 16px;">
          ⚠️ AVISO DE VENCIMENTO PRÓXIMO
        </div>
        <h2 style="color: #1e293b; margin: 0 0 12px 0; font-size: 18px; font-weight: 700;">Olá, ${fatura.arena_nome || 'Gestor'}!</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
          Informamos que a fatura de mensalidade da sua arena está próxima do vencimento. Mantenha seus pagamentos em dia para garantir a continuidade dos serviços e o agendamento de quadras sem interrupções.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="color: #64748b; padding-bottom: 8px;">Fatura:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 600; padding-bottom: 8px;">#${fatura.id}</td>
            </tr>
            <tr>
              <td style="color: #64748b; padding-bottom: 8px;">Valor:</td>
              <td style="text-align: right; color: #16a34a; font-weight: 700; font-size: 16px; padding-bottom: 8px;">R$ ${valorFormatado}</td>
            </tr>
            <tr>
              <td style="color: #64748b;">Data de Vencimento:</td>
              <td style="text-align: right; color: #dc2626; font-weight: 700;">${dataFormatada}</td>
            </tr>
          </table>
        </div>

        <p style="color: #475569; font-size: 13.5px; line-height: 1.5; margin: 0 0 24px 0;">
          Você pode pagar instantaneamente via <strong>Pix</strong> diretamente no painel administrativo da arena com liberação automática em segundos.
        </p>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="https://app.arenix.com.br" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
            Acessar Painel & Pagar com Pix
          </a>
        </div>

        <p style="color: #94a3b8; font-size: 12px; line-height: 1.4; margin: 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          Caso o pagamento já tenha sido efetuado, por favor desconsidere esta mensagem.
        </p>
      </div>
      <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; margin: 0; font-size: 12px;">© ${new Date().getFullYear()} Arenix SaaS. Todos os direitos reservados.</p>
      </div>
    </div>
  `;
};

/**
 * Busca arenas com faturas vencendo nos próximos 3 dias, envia e-mails e registra logs de auditoria.
 * @returns {Promise<{avisadas: number}>}
 */
const enviarAvisosVencimento = async () => {
  try {
    const faturasProximas = await db.allAsync(`
      SELECT f.id, f.valor, f.data_vencimento, a.nome as arena_nome,
             COALESCE(a.email, (SELECT email FROM Usuarios WHERE tenant_id = a.id AND perfil = 'Administrador' AND ativo = 1 LIMIT 1)) as arena_email
      FROM FaturasSaaS f
      JOIN Arenas a ON f.tenant_id = a.id
      WHERE f.status IN ('Pendente', 'Atrasada')
        AND date(f.data_vencimento) >= date('now')
        AND date(f.data_vencimento) <= date('now', '+3 days')
    `);

    let enviadosCount = 0;

    for (const fatura of faturasProximas) {
      console.log(
        `[SaaS Billing] AVISO: Fatura #${fatura.id} de R$${Number(fatura.valor).toFixed(2)} ` +
        `para '${fatura.arena_nome}' vence em ${fatura.data_vencimento}. E-mail: ${fatura.arena_email || 'Nenhum'}`
      );

      if (fatura.arena_email) {
        const assunto = `⚠️ Aviso de Vencimento: Fatura #${fatura.id} vence em ${formatarDataBR(fatura.data_vencimento)} — Arenix`;
        const html = gerarHtmlAvisoVencimento(fatura);
        const enviado = await sendEmail(fatura.arena_email, assunto, html);
        if (enviado) {
          enviadosCount++;
        }
      }

      logAuditEvent(
        0,
        'SaaS Billing: Aviso de Vencimento',
        `Aviso enviado para Arena '${fatura.arena_nome}' (E-mail: ${fatura.arena_email || 'Não informado'}) — Fatura #${fatura.id} vence em ${fatura.data_vencimento}`,
        '127.0.0.1'
      );
    }

    return { avisadas: faturasProximas.length, enviados: enviadosCount };
  } catch (err) {
    console.error('[SaaS Billing] Erro ao enviar avisos de vencimento:', err);
    return { avisadas: 0, enviados: 0 };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  getMasterAccessToken,
  gerarPixFaturaSaaS,
  liquidarFaturaSaaS,
  enviarAvisosVencimento,
};
