const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');

/**
 * Job de Bloqueio Automático por Inadimplência (RN-13)
 * Verifica faturas com status 'Pendente' ou 'Atrasada' vencidas há mais que dias_tolerancia_bloqueio.
 * Bloqueia as arenas afetadas (status = 0) e gera logs de auditoria.
 */
async function executarBloqueioInadimplencia() {
  try {
    // 1. Obter os dias de tolerância configurados no SaaS (default: 5 dias)
    const tolRow = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'dias_tolerancia_bloqueio'");
    const diasTolerancia = Number.parseInt(tolRow?.valor || '5', 10);

    // 2. Buscar arenas ativas com faturas vencidas além do prazo de tolerância
    const arenasInadimplentes = await db.allAsync(`
      SELECT DISTINCT a.id, a.nome, f.id as fatura_id, f.data_vencimento
      FROM Arenas a
      JOIN FaturasSaaS f ON f.tenant_id = a.id
      WHERE a.status = 1
        AND a.plano_id IS NOT NULL
        AND f.status IN ('Pendente', 'Atrasada')
        AND date(f.data_vencimento, '+' || ? || ' days') < date('now')
    `, [diasTolerancia]);

    let bloqueadasCount = 0;

    for (const item of arenasInadimplentes) {
      // Bloquear arena
      await db.runAsync('UPDATE Arenas SET status = 0 WHERE id = ?', [item.id]);

      // Atualizar status da fatura para 'Atrasada' se ainda estiver 'Pendente'
      await db.runAsync("UPDATE FaturasSaaS SET status = 'Atrasada' WHERE id = ?", [item.fatura_id]);

      // Log de auditoria para o sistema
      logAuditEvent(
        0, // 0 indica ação do sistema/cron
        'SaaS: Bloqueio Automático por Inadimplência',
        `Arena '${item.nome}' (ID: ${item.id}) foi bloqueada automaticamente devido à fatura #${item.fatura_id} vencida em ${item.data_vencimento} com tolerância de ${diasTolerancia} dias.`,
        '127.0.0.1'
      );

      bloqueadasCount++;
    }

    console.log(`[Job Cron] Bloqueio por inadimplência concluído. Arenas bloqueadas: ${bloqueadasCount}`);
    return { processadas: arenasInadimplentes.length, bloqueadas: bloqueadasCount, diasTolerancia };
  } catch (error) {
    console.error('[Job Cron Error] Falha ao executar bloqueio por inadimplência:', error);
    throw error;
  }
}

module.exports = { executarBloqueioInadimplencia };
