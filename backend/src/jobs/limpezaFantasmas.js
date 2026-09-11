const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');

/**
 * Job de Limpeza Automática de Cadastros Fantasma
 *
 * Um "cadastro fantasma" é uma arena que:
 *   1. Foi criada há mais de N dias (configurável via ConfiguracoesSaaS.dias_abandono_cadastro, padrão 7)
 *   2. Está com status = 0 (bloqueada/pendente)
 *   3. NUNCA teve uma única fatura Paga em toda a sua história (condição de proteção máxima)
 *
 * PROTEÇÃO GARANTIDA: Arenas com histórico de pagamento (mesmo que atualmente inadimplentes)
 * são completamente ignoradas por este job. Apenas abandonos de cadastro público são limpos.
 */
async function executarLimpezaFantasmas() {
  try {
    // 1. Obter prazo de abandono configurado (default: 7 dias)
    const prazoRow = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'dias_abandono_cadastro'");
    const diasAbandono = Number.parseInt(prazoRow?.valor || '7', 10);

    console.log(`[Job Fantasmas] Iniciando limpeza de cadastros com abandono > ${diasAbandono} dias...`);

    // 2. Buscar arenas elegíveis para limpeza com as 3 condições AND de proteção
    const fantasmas = await db.allAsync(`
      SELECT a.id, a.nome, a.email, a.criado_em
      FROM Arenas a
      WHERE
        a.status = 0
        AND a.criado_em <= date('now', '-' || ? || ' days')
        AND NOT EXISTS (
          SELECT 1 FROM FaturasSaaS f
          WHERE f.tenant_id = a.id AND f.status = 'Paga'
        )
    `, [diasAbandono]);

    if (fantasmas.length === 0) {
      console.log('[Job Fantasmas] Nenhum cadastro fantasma encontrado. Banco limpo!');
      return { processadas: 0, removidas: 0 };
    }

    console.log(`[Job Fantasmas] ${fantasmas.length} cadastro(s) fantasma encontrado(s). Iniciando remoção...`);

    let removidas = 0;

    for (const arena of fantasmas) {
      const arenaId = arena.id;
      const timestamp = Math.floor(Date.now() / 1000);

      // 3a. Liberar e-mails dos usuários (anonymization para liberar o campo UNIQUE)
      await db.runAsync(
        `UPDATE Usuarios
         SET ativo = 0,
             email = email || '__deleted_' || ?
         WHERE tenant_id = ?
           AND email NOT LIKE '%__deleted_%'`,
        [timestamp, arenaId]
      );

      // 3b. Soft-delete da arena (status = -1)
      await db.runAsync('UPDATE Arenas SET status = -1 WHERE id = ?', [arenaId]);

      // 3c. Remover sessões ativas (caso existam tokens órfãos)
      await db.runAsync('DELETE FROM SessoesAtivas WHERE tenant_id = ?', [arenaId]);

      // 3d. Log de auditoria com detalhes completos
      logAuditEvent(
        0, // 0 = ação do sistema/cron
        'SaaS: Limpeza de Cadastro Fantasma',
        `Arena '${arena.nome}' (ID: ${arenaId}, E-mail: ${arena.email || 'sem e-mail'}) removida automaticamente por abandono de cadastro após ${diasAbandono} dias sem pagamento. Criada em: ${arena.criado_em}.`,
        '127.0.0.1'
      );

      console.log(`[Job Fantasmas] Arena '${arena.nome}' (ID: ${arenaId}) removida. E-mail liberado.`);
      removidas++;
    }

    console.log(`[Job Fantasmas] Limpeza concluída. Total removido: ${removidas} arena(s) fantasma.`);
    return { processadas: fantasmas.length, removidas, diasAbandono };
  } catch (error) {
    console.error('[Job Fantasmas Error] Falha ao executar limpeza de fantasmas:', error);
    throw error;
  }
}

module.exports = { executarLimpezaFantasmas };
