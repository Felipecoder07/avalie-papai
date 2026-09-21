const db = require('../config/database');
const logger = require('../utils/safeLogger').forModule('reconciliacaoOutbox');
const { ensureSecuritySchema } = require('../config/securitySchema');
const {
  resolverContextoWebhookMercadoPago,
  reconciliarPagamentoSemReferencia,
  liquidarWebhookMercadoPago,
  reconciliarEstornoMercadoPago
} = require('../services/gatewayService');

const DEFAULT_STALE_MS = 5 * 60 * 1000;
const BATCH_SIZE = 100;
let activeRun = null;

async function enqueueReview(id, kind, payload) {
  await db.runAsync(
    'INSERT OR IGNORE INTO SecurityOutbox(id,kind,payload,created) VALUES(?,?,?,?)',
    [id, kind, JSON.stringify(payload), Date.now()]
  );
}

async function resolverPagamentosPendentes({ now = Date.now(), olderThanMs = DEFAULT_STALE_MS } = {}) {
  await ensureSecuritySchema(db);
  const threshold = now - Math.max(0, olderThanMs);
  const result = { payments: 0, refunds: 0, completed: 0, pending: 0, failed: 0, blocked: 0, errors: 0 };

  const paymentsWithoutReference = await db.allAsync(`
    SELECT id, tenant_id, gateway_ref, updated
    FROM PaymentIntents
    WHERE state IN ('creating', 'pending', 'unknown')
      AND (gateway_ref IS NULL OR TRIM(gateway_ref) = '')
      AND updated <= ?
    ORDER BY updated, id
    LIMIT ?
  `, [threshold, BATCH_SIZE]);

  for (const intent of paymentsWithoutReference) {
    result.payments++;
    try {
      const outcome = await reconciliarPagamentoSemReferencia(intent.id);
      const state = outcome?.state || 'pending';
      if (Object.hasOwn(result, state)) result[state]++;
      if (state === 'blocked' || (state === 'pending' && now - Number(intent.updated) >= 24 * 60 * 60 * 1000)) {
        await enqueueReview(`reconcile:payment:${intent.id}`, 'payment_reference_reconciliation_required', {
          tenant_id: intent.tenant_id,
          payment_intent_id: intent.id,
          state
        });
      }
    } catch (error) {
      result.errors++;
      logger.warn(`[Reconciliação] Falha temporária ao pesquisar intenção ${intent.id}:`, error.message);
    }
  }

  const payments = await db.allAsync(`
    SELECT id, tenant_id, gateway_ref
    FROM PaymentIntents
    WHERE state IN ('pending', 'unknown')
      AND gateway_ref IS NOT NULL
      AND TRIM(gateway_ref) <> ''
      AND updated <= ?
    ORDER BY updated, id
    LIMIT ?
  `, [threshold, BATCH_SIZE]);

  for (const intent of payments) {
    result.payments++;
    try {
      const context = await resolverContextoWebhookMercadoPago(intent.gateway_ref);
      const outcome = context
        ? await liquidarWebhookMercadoPago(intent.gateway_ref, context)
        : { state: 'blocked' };
      const state = outcome?.state || 'pending';
      if (Object.hasOwn(result, state)) result[state]++;
      if (state === 'blocked') {
        await enqueueReview(`reconcile:payment:${intent.id}`, 'payment_reconciliation_blocked', {
          tenant_id: intent.tenant_id,
          payment_intent_id: intent.id,
          gateway_ref: intent.gateway_ref
        });
      }
    } catch (error) {
      result.errors++;
      logger.warn(`[Reconciliação] Falha temporária ao consultar pagamento ${intent.gateway_ref}:`, error.message);
    }
  }

  const refunds = await db.allAsync(`
    SELECT ri.id, ri.gateway_ref, COALESCE(pi.tenant_id, r.tenant_id) AS tenant_id
    FROM RefundIntents ri
    LEFT JOIN PaymentIntents pi ON pi.gateway_ref = ri.gateway_ref
    LEFT JOIN TransacoesGateway tx ON tx.gateway_ref = ri.gateway_ref
    LEFT JOIN Reservas r ON r.id = tx.reserva_id
    WHERE ri.state IN ('pending', 'unknown')
      AND ri.created <= ?
    ORDER BY ri.created, ri.id
    LIMIT ?
  `, [threshold, BATCH_SIZE]);

  for (const intent of refunds) {
    result.refunds++;
    try {
      const outcome = await reconciliarEstornoMercadoPago(intent.id);
      const state = outcome?.state || 'pending';
      if (Object.hasOwn(result, state)) result[state]++;
      if (['blocked', 'failed'].includes(state)) {
        await enqueueReview(`reconcile:refund:${intent.id}`, 'refund_reconciliation_required', {
          tenant_id: intent.tenant_id,
          refund_intent_id: intent.id,
          gateway_ref: intent.gateway_ref,
          state
        });
      }
    } catch (error) {
      result.errors++;
      logger.warn(`[Reconciliação] Falha temporária ao consultar estorno ${intent.id}:`, error.message);
    }
  }

  return result;
}

async function processarEventosOutbox() {
  const events = await db.allAsync(`
    SELECT id, kind, payload, created
    FROM SecurityOutbox
    WHERE sent = 0
    ORDER BY created, id
    LIMIT ?
  `, [BATCH_SIZE]);
  let processed = 0;

  for (const event of events) {
    let payload;
    try {
      payload = JSON.parse(event.payload || '{}');
    } catch {
      logger.error(`[Reconciliação] Evento ${event.id} contém payload inválido e não foi descartado.`);
      continue;
    }

    const tenantId = Number(payload.tenant_id);
    if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
      logger.error(`[Reconciliação] Evento ${event.id} não identifica uma arena e não foi descartado.`);
      continue;
    }

    const details = payload.motivo || JSON.stringify(payload);
    const auditMessage = `[Reconciliação Financeira] Atenção necessária: ${event.kind}. ${details}`;
    let handled = false;
    await db.transaction(async () => {
      const claim = await db.runAsync('UPDATE SecurityOutbox SET sent = 1 WHERE id = ? AND sent = 0', [event.id]);
      if (!claim.changes) return;
      await db.runAsync(`
        INSERT INTO LogsAuditoria(tenant_id, usuario_id, evento, detalhes, ip)
        VALUES(?, NULL, ?, ?, ?)
      `, [tenantId, 'Alerta de Reconciliação', auditMessage, '127.0.0.1']);
      handled = true;
    });
    if (handled) processed++;
  }

  return processed;
}

function processarOutbox(options = {}) {
  if (activeRun) return activeRun;
  activeRun = (async () => {
    const reconciliation = await resolverPagamentosPendentes(options);
    const outbox = await processarEventosOutbox();
    logger.log(`[Reconciliação] Pagamentos: ${reconciliation.payments}; estornos: ${reconciliation.refunds}; alertas: ${outbox}.`);
    return { ...reconciliation, outbox };
  })().finally(() => {
    activeRun = null;
  });
  return activeRun;
}

module.exports = { processarOutbox, resolverPagamentosPendentes, processarEventosOutbox };
