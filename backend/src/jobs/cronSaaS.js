const logger = require('../utils/safeLogger').forModule('cronSaaS');
const cron = require('node-cron');
const db = require('../config/database');
const { formatarCompetencia, calcularProximaDataVencimento } = require('../utils/dateUtils');
const { enviarAvisosVencimento } = require('../services/saasBillingService');
const { executarBloqueioInadimplencia } = require('./bloqueioInadimplencia');
const { executarLimpezaFantasmas } = require('./limpezaFantasmas');
const { processarOutbox } = require('./reconciliacaoOutbox');

async function buscarArenasParaFaturamento(todayStr, currentDay, lastDayOfMonth) {
  const queryVencimento = (currentDay === lastDayOfMonth)
    ? '(a.dia_vencimento = ? OR a.dia_vencimento > ?)'
    : 'a.dia_vencimento = ?';
  const paramsVencimento = (currentDay === lastDayOfMonth)
    ? [currentDay, currentDay, todayStr]
    : [currentDay, todayStr];

  const arenasRecorrentes = await db.allAsync(`
    SELECT a.id as tenant_id, a.nome as arena_nome, a.plano_id, a.ciclo_cobranca, a.dia_vencimento,
           p.nome as plano_nome, p.valor_mensal, p.valor_anual 
    FROM Arenas a 
    JOIN PlanosSaaS p ON a.plano_id = p.id
    WHERE a.status = 1 
      AND ${queryVencimento}
      AND (a.trial_expira_em IS NULL OR date(a.trial_expira_em) <= date(?))
  `, paramsVencimento);

  const arenasTrialExpiradas = await db.allAsync(`
    SELECT a.id as tenant_id, a.nome as arena_nome, a.plano_id, a.ciclo_cobranca, a.dia_vencimento,
           p.nome as plano_nome, p.valor_mensal, p.valor_anual
    FROM Arenas a
    JOIN PlanosSaaS p ON a.plano_id = p.id
    WHERE a.status = 1
      AND a.trial_expira_em IS NOT NULL
      AND date(a.trial_expira_em) <= date(?)
      AND NOT EXISTS (SELECT 1 FROM FaturasSaaS f WHERE f.tenant_id = a.id)
  `, [todayStr]);

  const map = new Map();
  [...arenasRecorrentes, ...arenasTrialExpiradas].forEach(a => map.set(a.tenant_id, a));
  return Array.from(map.values());
}

async function isPeriodoCoberto(arena, currentDay, todayStr) {
  const ultimaPaga = await db.getAsync(`
    SELECT data_vencimento, ciclo FROM FaturasSaaS
    WHERE tenant_id = ? AND status = 'Paga'
    ORDER BY data_vencimento DESC, id DESC
    LIMIT 1
  `, [arena.tenant_id]);

  if (!ultimaPaga) return false;

  const diaVenc = arena.dia_vencimento || currentDay;
  const coberturaAte = calcularProximaDataVencimento(
    ultimaPaga.data_vencimento,
    diaVenc,
    ultimaPaga.ciclo || arena.ciclo_cobranca || 'mensal'
  );
  return coberturaAte > todayStr;
}

function calcularValorFatura(arena, ciclo) {
  if (ciclo !== 'anual') {
    return arena.valor_mensal;
  }
  const precoMensalAnual = (arena.valor_anual && arena.valor_anual > 0)
    ? arena.valor_anual
    : (arena.valor_mensal * 0.8);
  return Number.parseFloat((precoMensalAnual * 12).toFixed(2));
}

async function processarFaturaArena(arena, currentYear, currentMonth, todayStr, currentDay) {
  const mesAtualStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  const faturaMesAtual = await db.getAsync(`
    SELECT id FROM FaturasSaaS 
    WHERE tenant_id = ? AND strftime('%Y-%m', data_vencimento) = ?
  `, [arena.tenant_id, mesAtualStr]);

  if (faturaMesAtual) return;

  const coberto = await isPeriodoCoberto(arena, currentDay, todayStr);
  if (coberto) return;

  const ciclo = arena.ciclo_cobranca || 'mensal';
  const valorFinal = calcularValorFatura(arena, ciclo);
  const competenciaNome = formatarCompetencia(todayStr, ciclo);
  const descricao = `Assinatura Plano ${arena.plano_nome || 'SaaS'} - ${competenciaNome}`;

  await db.runAsync(`
    INSERT INTO FaturasSaaS (tenant_id, plano_id, valor, ciclo, descricao, data_vencimento, status)
    VALUES (?, ?, ?, ?, ?, ?, 'Pendente')
  `, [arena.tenant_id, arena.plano_id, valorFinal, ciclo, descricao, todayStr]);

  logger.log(`[SaaS CRON] Fatura de R$${valorFinal} (${ciclo}) gerada para Arena ID: ${arena.tenant_id} (${descricao})`);
}

const processSaaS = async () => {
  logger.log('[SaaS CRON] Iniciando processamento financeiro diário...');
  try {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
    const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();

    // 1. Gerar Novas Faturas
    const arenasParaFaturar = await buscarArenasParaFaturamento(todayStr, currentDay, lastDayOfMonth);
    for (const arena of arenasParaFaturar) {
      await processarFaturaArena(arena, currentYear, currentMonth, todayStr, currentDay);
    }

    // 2. Avisos de vencimento próximo
    await enviarAvisosVencimento();

    // 3. Bloqueio de inadimplência
    await executarBloqueioInadimplencia();

    // 4. Limpeza de cadastros abandonados
    await executarLimpezaFantasmas();

    // 5. Reconciliação do Outbox Financeiro
    await processarOutbox();

    logger.log('[SaaS CRON] Processamento financeiro finalizado com sucesso.');
  } catch (err) {
    logger.error('[SaaS CRON Error] Falha ao processar billing:', err);
  }
};

const startSaaSCron = () => {
  cron.schedule('0 0 * * *', () => {
    processSaaS();
  });
  logger.log('Serviço de CRON Financeiro (SaaS) inicializado.');
};

module.exports = { startSaaSCron, processSaaS };
