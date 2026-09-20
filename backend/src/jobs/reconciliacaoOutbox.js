const db = require('../config/database');
const logger = require('../utils/safeLogger').forModule('reconciliacaoOutbox');
const { resolverContextoWebhookMercadoPago, liquidarWebhookMercadoPago } = require('../services/gatewayService');

/**
 * Job para processar eventos financeiros isolados na SecurityOutbox.
 * Garante que pagamentos atrasados de reservas canceladas não se percam
 * e sejam notificados para a Arena realizar auditoria/estorno manual.
 */
async function resolverPagamentosPendentes() {
  logger.log('[Reconciliação] Buscando intenções de pagamento pendentes...');
  try {
    const limitTime = Date.now() - 5 * 60000; // 5 minutos atrás
    const intents = await db.allAsync(`
      SELECT DISTINCT gateway_ref FROM PaymentIntents 
      WHERE state IN ('pending', 'unknown') AND gateway_ref IS NOT NULL AND updated < ?
      UNION
      SELECT DISTINCT gateway_ref FROM RefundIntents
      WHERE state IN ('pending', 'unknown') AND gateway_ref IS NOT NULL AND created < ?
    `, [limitTime, limitTime]);

    if (intents.length > 0) {
      logger.log(`[Reconciliação] Sincronizando ${intents.length} intenções pendentes com o provedor...`);
      for (const intent of intents) {
        try {
          const context = await resolverContextoWebhookMercadoPago(intent.gateway_ref);
          if (context) {
            await liquidarWebhookMercadoPago(intent.gateway_ref, context);
            logger.log(`[Reconciliação] Intenção ${intent.gateway_ref} sincronizada com sucesso.`);
          } else {
            logger.warn(`[Reconciliação] Não foi possível resolver o contexto para a intenção ${intent.gateway_ref}.`);
          }
        } catch (err) {
          logger.warn(`[Reconciliação] Erro ao sincronizar intenção ${intent.gateway_ref}:`, err.message);
        }
      }
    }
  } catch (err) {
    logger.error('[Reconciliação Error] Falha ao sincronizar intenções com o provedor.', err);
  }
}

async function processarOutbox() {
  await resolverPagamentosPendentes();
  
  logger.log('[Reconciliação] Buscando eventos pendentes na SecurityOutbox...');

  try {
    // Buscar até 100 eventos não enviados
    const eventos = await db.allAsync(`
      SELECT id, kind, payload, created 
      FROM SecurityOutbox 
      WHERE sent = 0 
      ORDER BY id ASC LIMIT 100
    `);

    if (eventos.length === 0) {
      return;
    }

    logger.log(`[Reconciliação] Processando ${eventos.length} eventos do Outbox...`);

    for (const evento of eventos) {
      // Registrar log de auditoria explícito para a Arena sobre o evento
      let detalhes = '';
      let tenantId = 0;
      
      try {
        const payloadData = JSON.parse(evento.payload || '{}');
        detalhes = payloadData.motivo || JSON.stringify(payloadData);
        tenantId = payloadData.tenant_id || 0;
      } catch {
        detalhes = evento.payload;
      }

      const mensagemAuditoria = `[Reconciliação Financeira] Atenção necessária: ${evento.kind}. ${detalhes}`;

      // Usa uma transação para garantir que o outbox seja atualizado atomicamente
      await db.transaction(async () => {
        if (tenantId) {
          await db.runAsync(`
            INSERT INTO LogsAuditoria(tenant_id, usuario_id, evento, detalhes, ip)
            VALUES(?, NULL, ?, ?, ?)
          `, [tenantId, 'Alerta de Reconciliação', mensagemAuditoria, '127.0.0.1']);
        }

        await db.runAsync('UPDATE SecurityOutbox SET sent = 1 WHERE id = ?', [evento.id]);
      });

      logger.log(`[Reconciliação] Evento #${evento.id} processado (Tenant ${tenantId}).`);
    }

    logger.log('[Reconciliação] Concluído com sucesso.');
  } catch (error) {
    logger.error('[Reconciliação Error] Falha ao processar a tabela SecurityOutbox.', error);
  }
}

module.exports = { processarOutbox };
