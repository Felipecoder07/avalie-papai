const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireRole } = require('../middlewares/auth');
const saasBillingService = require('../services/saasBillingService');
const logAuditEvent = require('../utils/auditLogger');
const { formatarCompetencia, calcularProximaDataVencimento, calcularDiasRestantesTrial, NOMES_MESES } = require('../utils/dateUtils');

// Todas as rotas requerem usuário autenticado com perfil Administrador ou Gerente da Arena
router.use(verifyToken);
router.use(requireRole(['Administrador', 'Gerente']));

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/tenant/assinatura/plano
// Retorna os dados do plano atual da arena, limites, uso e cálculo de vigência/cobertura.
// ─────────────────────────────────────────────────────────────────────────────
function calcularMetricasCoberturaEAssinatura({ arena, todasFaturas, faturasPagas, faturasPendentes, diaVenc, cicloArena, hojeStr }) {
  let coberturaAte = null;
  let proximoVencimento = null;
  let mesesAdiantados = 0;
  let proximaCompetencia = null;

  if (faturasPagas.length > 0) {
    const ultimaPaga = faturasPagas[faturasPagas.length - 1];
    coberturaAte = calcularProximaDataVencimento(ultimaPaga.data_vencimento, diaVenc, ultimaPaga.ciclo || cicloArena);
    proximoVencimento = coberturaAte;

    const [anoHoje, mesHoje] = hojeStr.split('-').map(Number);
    const [anoCob, mesCob] = coberturaAte.split('-').map(Number);
    const diffMeses = (anoCob - anoHoje) * 12 + (mesCob - mesHoje);
    mesesAdiantados = Math.max(0, diffMeses - 1);
  } else if (arena.trial_expira_em && arena.trial_expira_em >= hojeStr) {
    coberturaAte = arena.trial_expira_em;
    proximoVencimento = arena.trial_expira_em;
    mesesAdiantados = 0;
  } else {
    proximoVencimento = calcularProximaDataVencimento(null, diaVenc, cicloArena);
    coberturaAte = null;
    mesesAdiantados = 0;
  }

  let faturaAtual = null;
  if (faturasPendentes.length > 0) {
    faturaAtual = faturasPendentes[0];
    proximoVencimento = faturaAtual.data_vencimento;
    proximaCompetencia = formatarCompetencia(faturaAtual.data_vencimento, faturaAtual.ciclo || cicloArena);
  } else {
    const ultimaFatura = todasFaturas.length > 0 ? todasFaturas[todasFaturas.length - 1] : null;
    const dataProx = ultimaFatura 
      ? calcularProximaDataVencimento(ultimaFatura.data_vencimento, diaVenc, ultimaFatura.ciclo || cicloArena)
      : calcularProximaDataVencimento(null, diaVenc, cicloArena);
    proximaCompetencia = formatarCompetencia(dataProx, cicloArena);
  }

  return { coberturaAte, proximoVencimento, mesesAdiantados, proximaCompetencia, faturaAtual };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/tenant/assinatura/plano
// Retorna os dados do plano atual da arena, limites, uso e cálculo de vigência/cobertura.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plano', async (req, res) => {
  const tenantId = req.user.tenant_id;
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID não associado ao usuário.' });
  }

  try {
    const arena = await db.getAsync(`
      SELECT a.id, a.nome, a.status as arena_status, a.dia_vencimento, a.trial_expira_em, a.ciclo_cobranca,
             p.id as plano_id, p.nome as plano_nome, p.max_quadras, p.max_usuarios, p.valor_mensal, p.valor_anual
      FROM Arenas a
      LEFT JOIN PlanosSaaS p ON a.plano_id = p.id
      WHERE a.id = ?
    `, [tenantId]);

    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    const countQuadras = await db.getAsync('SELECT COUNT(*) as total FROM Quadras WHERE tenant_id = ? AND status != "Excluida"', [tenantId]);
    const countUsuarios = await db.getAsync("SELECT COUNT(*) as total FROM Usuarios WHERE tenant_id = ? AND ativo = 1 AND (perfil IS NULL OR (perfil != 'Cliente' AND perfil != 'cliente'))", [tenantId]);

    const todasFaturas = await db.allAsync(`
      SELECT id, valor, data_vencimento, data_pagamento, status, ciclo, descricao
      FROM FaturasSaaS
      WHERE tenant_id = ?
      ORDER BY data_vencimento ASC, id ASC
    `, [tenantId]);

    const faturasPagas = todasFaturas.filter(f => f.status === 'Paga');
    const faturasPendentes = todasFaturas.filter(f => f.status === 'Pendente' || f.status === 'Atrasada');

    const diaVenc = arena.dia_vencimento || 10;
    const cicloArena = arena.ciclo_cobranca || 'mensal';
    const hojeStr = new Date().toISOString().split('T')[0];

    const { coberturaAte, proximoVencimento, mesesAdiantados, proximaCompetencia, faturaAtual } = calcularMetricasCoberturaEAssinatura({
      arena,
      todasFaturas,
      faturasPagas,
      faturasPendentes,
      diaVenc,
      cicloArena,
      hojeStr
    });

    const emTrial = !!(arena.trial_expira_em && arena.trial_expira_em >= hojeStr);
    const diasRestantesTrial = emTrial ? calcularDiasRestantesTrial(arena.trial_expira_em) : 0;

    res.json({
      arena_id: arena.id,
      arena_nome: arena.nome,
      arena_status: arena.arena_status,
      dia_vencimento: arena.dia_vencimento,
      trial_expira_em: arena.trial_expira_em,
      em_trial: emTrial,
      dias_restantes_trial: diasRestantesTrial,
      ciclo_cobranca: cicloArena,
      cobertura_ate: coberturaAte,
      proximo_vencimento: proximoVencimento,
      meses_adiantados: mesesAdiantados,
      proxima_competencia: proximaCompetencia,
      plano: {
        id: arena.plano_id,
        nome: arena.plano_nome || 'Nenhum',
        valor_mensal: arena.valor_mensal || 0,
        valor_anual: arena.valor_anual || 0,
        max_quadras: arena.max_quadras || 0,
        max_usuarios: arena.max_usuarios || 0,
      },
      uso: {
        quadras_usadas: countQuadras ? countQuadras.total : 0,
        usuarios_usados: countUsuarios ? countUsuarios.total : 0,
      },
      fatura_atual: faturaAtual || (faturasPagas.length > 0 ? faturasPagas[faturasPagas.length - 1] : null),
    });
  } catch (err) {
    console.error('[Tenant Assinatura API Error]', err);
    res.status(500).json({ error: 'Erro ao buscar dados da assinatura.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/tenant/assinatura/faturas
// Retorna a lista de faturas do SaaS pertencentes exclusivamente à arena logada com competência.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/faturas', async (req, res) => {
  const tenantId = req.user.tenant_id;
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID não associado ao usuário.' });
  }

  try {
    const faturas = await db.allAsync(`
      SELECT f.id, f.valor, f.data_vencimento, f.data_pagamento, f.status,
             f.gateway_ref, f.copia_cola, f.qr_expira_em, f.metodo_pagamento,
             f.ciclo, f.descricao,
             p.nome as plano_nome
      FROM FaturasSaaS f
      JOIN PlanosSaaS p ON f.plano_id = p.id
      WHERE f.tenant_id = ?
      ORDER BY f.data_vencimento DESC, f.id DESC
    `, [tenantId]);

    const hoje = new Date().toISOString().split('T')[0];
    const [anoH, mesH] = hoje.split('-').map(Number);

    const faturasFormatadas = faturas.map(f => {
      const competencia = formatarCompetencia(f.data_vencimento, f.ciclo || 'mensal');
      const [anoV, mesV] = (f.data_vencimento || hoje).split('-').map(Number);
      const isAntecipada = (anoV > anoH) || (anoV === anoH && mesV > mesH);
      return {
        ...f,
        competencia,
        antecipada: isAntecipada
      };
    });

    res.json(faturasFormatadas);
  } catch (err) {
    console.error('[Tenant Assinatura API Error]', err);
    res.status(500).json({ error: 'Erro ao buscar faturas da assinatura.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /api/tenant/assinatura/faturas/:id/gerar-pix
// Gera (ou retorna Pix ativo) para a fatura informada.
// Validação rígida: a fatura DEVE pertencer ao tenant_id do usuário logado!
// ─────────────────────────────────────────────────────────────────────────────
router.post('/faturas/:id/gerar-pix', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const faturaId = Number.parseInt(req.params.id, 10);

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID não associado ao usuário.' });
  }
  if (isNaN(faturaId)) {
    return res.status(400).json({ error: 'ID de fatura inválido.' });
  }

  try {
    const fatura = await db.getAsync('SELECT tenant_id FROM FaturasSaaS WHERE id = ?', [faturaId]);
    if (!fatura) {
      return res.status(404).json({ error: 'Fatura não encontrada.' });
    }
    if (fatura.tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Acesso negado. Esta fatura não pertence à sua arena.' });
    }

    const pixData = await saasBillingService.gerarPixFaturaSaaS(faturaId);
    res.json(pixData);
  } catch (err) {
    console.error('[Tenant Assinatura Gerar Pix Error]', err);
    res.status(400).json({ error: err.message || 'Erro ao gerar Pix da fatura.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3.1 POST /api/tenant/assinatura/faturas/:id/simular-pagamento
// Simula a liquidação imediata da fatura para fins de teste/demonstração.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/faturas/:id/simular-pagamento', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && req.user.perfil !== 'SuperAdmin') {
    return res.status(403).json({ error: 'A simulação de pagamentos está desabilitada em ambiente de produção.' });
  }

  const tenantId = req.user.tenant_id;
  const faturaId = Number.parseInt(req.params.id, 10);

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID não associado ao usuário.' });
  }
  if (isNaN(faturaId)) {
    return res.status(400).json({ error: 'ID de fatura inválido.' });
  }

  try {
    const fatura = await db.getAsync(`
      SELECT f.id, f.tenant_id, f.plano_id, f.valor, f.status, f.gateway_ref,
             a.nome as arena_nome, a.status as arena_status, p.nome as plano_nome
      FROM FaturasSaaS f
      JOIN Arenas a ON f.tenant_id = a.id
      JOIN PlanosSaaS p ON f.plano_id = p.id
      WHERE f.id = ?
    `, [faturaId]);

    if (!fatura) {
      return res.status(404).json({ error: 'Fatura não encontrada.' });
    }

    if (fatura.tenant_id !== tenantId) {
      logAuditEvent(
        req.user.id,
        'SaaS: Tentativa Não Autorizada de Simulação',
        `Usuário tentou simular pagamento da fatura #${faturaId} de outra arena (Tenant Fatura: ${fatura.tenant_id}, Tenant Usuário: ${tenantId}).`,
        req.headers['x-forwarded-for'] || req.ip
      );
      return res.status(403).json({ error: 'Acesso negado. Esta fatura não pertence à sua arena.' });
    }

    let gatewayRef = fatura.gateway_ref;
    if (!gatewayRef) {
      gatewayRef = `SIM_SAAS_FATURA_${fatura.id}_${Date.now()}`;
      await db.runAsync(`
        UPDATE FaturasSaaS
        SET gateway_ref = ?, metodo_pagamento = 'Pix Online'
        WHERE id = ?
      `, [gatewayRef, fatura.id]);
    }

    const liquidacaoResult = await saasBillingService.liquidarFaturaSaaS(gatewayRef);

    logAuditEvent(
      req.user.id,
      'SaaS: Simulação de Pagamento',
      `Pagamento simulado para fatura #${faturaId} (Plano ${fatura.plano_nome}, R$ ${fatura.valor.toFixed(2)}) da Arena '${fatura.arena_nome}'.`,
      req.headers['x-forwarded-for'] || req.ip
    );

    res.json({
      message: 'Pagamento simulado e aprovado com sucesso!',
      fatura_id: fatura.id,
      status: 'Paga',
      pago: true,
      plano_nome: fatura.plano_nome,
      arena_desbloqueada: liquidacaoResult.arena_desbloqueada,
      plano_atualizado: liquidacaoResult.plano_atualizado,
    });
  } catch (err) {
    console.error('[Tenant Assinatura Simular Pagamento Error]', err);
    res.status(400).json({ error: err.message || 'Erro ao processar simulação de pagamento.' });
  }
});

async function verificarStatusMercadoPagoAoVivo(fatura) {
  if (fatura.status === 'Paga' || !fatura.gateway_ref) return null;
  try {
    const token = await saasBillingService.getMasterAccessToken();
    if (token) {
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${fatura.gateway_ref}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (mpRes.ok) {
        const mpData = await mpRes.json();
        if (mpData.status === 'approved') {
          const resLiquida = await saasBillingService.liquidarFaturaSaaS(fatura.gateway_ref);
          return {
            fatura_id: fatura.id,
            status: 'Paga',
            data_pagamento: new Date().toISOString().split('T')[0],
            pago: true,
            arena_ativa: true,
            arena_desbloqueada: resLiquida.arena_desbloqueada
          };
        }
      }
    }
  } catch (mpErr) {
    console.error('[Status Polling MP Live Check Error]', mpErr.message);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /api/tenant/assinatura/status-pagamento/:gateway_ref
// Usado pelo Polling do frontend para verificar se o Pix da mensalidade foi pago.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status-pagamento/:gateway_ref', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { gateway_ref } = req.params;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID não associado ao usuário.' });
  }

  try {
    let fatura = await db.getAsync(`
      SELECT f.id, f.status, f.data_pagamento, f.tenant_id, f.gateway_ref, a.status as arena_status
      FROM FaturasSaaS f
      JOIN Arenas a ON f.tenant_id = a.id
      WHERE f.gateway_ref = ? OR f.id = ?
    `, [gateway_ref, gateway_ref]);

    if (!fatura) {
      return res.status(404).json({ error: 'Fatura não encontrada.' });
    }
    if (fatura.tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const liveApproved = await verificarStatusMercadoPagoAoVivo(fatura);
    if (liveApproved) {
      return res.json(liveApproved);
    }

    const recheckArena = await db.getAsync('SELECT status FROM Arenas WHERE id = ?', [tenantId]);

    res.json({
      fatura_id: fatura.id,
      status: fatura.status,
      data_pagamento: fatura.data_pagamento,
      pago: fatura.status === 'Paga',
      arena_ativa: recheckArena ? recheckArena.status === 1 : fatura.arena_status === 1,
    });
  } catch (err) {
    console.error('[Tenant Assinatura Status Polling Error]', err);
    res.status(500).json({ error: 'Erro ao consultar status do pagamento.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET /api/tenant/assinatura/planos-disponiveis
// Retorna a lista de todos os planos SaaS disponíveis para upgrade/troca.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/planos-disponiveis', async (req, res) => {
  try {
    const planos = await db.allAsync(`
      SELECT id, nome, max_quadras, max_usuarios, valor_mensal, valor_anual
      FROM PlanosSaaS
      ORDER BY valor_mensal ASC
    `);
    res.json(planos);
  } catch (err) {
    console.error('[Tenant Assinatura Planos Error]', err);
    res.status(500).json({ error: 'Erro ao buscar planos disponíveis.' });
  }
});

async function validarCapacidadeNovoPlano(tenantId, novoPlano) {
  const [countQuadras, countUsuarios] = await Promise.all([
    db.getAsync('SELECT COUNT(*) as total FROM Quadras WHERE tenant_id = ? AND status != "Excluida"', [tenantId]),
    db.getAsync("SELECT COUNT(*) as total FROM Usuarios WHERE tenant_id = ? AND ativo = 1 AND (perfil IS NULL OR (perfil != 'Cliente' AND perfil != 'cliente'))", [tenantId])
  ]);

  const quadrasAtuais = countQuadras ? countQuadras.total : 0;
  const usuariosAtuais = countUsuarios ? countUsuarios.total : 0;

  if (novoPlano.max_quadras > 0 && quadrasAtuais > novoPlano.max_quadras) {
    throw new Error(`Sua arena possui ${quadrasAtuais} quadras ativas, excedendo o limite de ${novoPlano.max_quadras} do plano ${novoPlano.nome}. Remova ou arquive quadras excedentes antes de migrar para este plano.`);
  }

  if (novoPlano.max_usuarios > 0 && usuariosAtuais > novoPlano.max_usuarios) {
    throw new Error(`Sua arena possui ${usuariosAtuais} funcionários ativos, excedendo o limite de ${novoPlano.max_usuarios} do plano ${novoPlano.nome}. Remova ou desative funcionários excedentes antes de migrar para este plano.`);
  }
}

function calcularValoresUpgradePlano(novoPlano, ciclo) {
  const cicloEscolhido = ciclo === 'anual' ? 'anual' : 'mensal';
  let valorFinal = novoPlano.valor_mensal;
  let descricaoFinal = `Assinatura Plano ${novoPlano.nome} (Mensal)`;

  if (cicloEscolhido === 'anual') {
    const precoMensalAnual = (novoPlano.valor_anual && novoPlano.valor_anual > 0)
      ? novoPlano.valor_anual
      : (novoPlano.valor_mensal * 0.8);
    valorFinal = Number.parseFloat((precoMensalAnual * 12).toFixed(2));
    descricaoFinal = `Assinatura Plano ${novoPlano.nome} (Anual - 12 meses)`;
  }

  return { cicloEscolhido, valorFinal, descricaoFinal };
}

async function obterOuCriarFaturaUpgrade({ tenantId, novoPlano, valorFinal, cicloEscolhido, descricaoFinal, hoje }) {
  let faturaPendente = await db.getAsync(`
    SELECT id, valor, plano_id, status
    FROM FaturasSaaS
    WHERE tenant_id = ? AND status IN ('Pendente', 'Atrasada')
    ORDER BY id DESC
    LIMIT 1
  `, [tenantId]);

  if (faturaPendente) {
    await db.runAsync(`
      UPDATE FaturasSaaS
      SET plano_id = ?, valor = ?, ciclo = ?, descricao = ?, gateway_ref = NULL, copia_cola = NULL, qr_expira_em = NULL
      WHERE id = ?
    `, [novoPlano.id, valorFinal, cicloEscolhido, descricaoFinal, faturaPendente.id]);
    return faturaPendente.id;
  }

  const result = await db.runAsync(`
    INSERT INTO FaturasSaaS (tenant_id, plano_id, valor, ciclo, descricao, data_vencimento, status)
    VALUES (?, ?, ?, ?, ?, ?, 'Pendente')
  `, [tenantId, novoPlano.id, valorFinal, cicloEscolhido, descricaoFinal, hoje]);
  return result.lastID;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. POST /api/tenant/assinatura/solicitar-upgrade
// Processa a solicitação de upgrade/troca de plano feita pelo gestor da arena.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/solicitar-upgrade', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { plano_id, ciclo } = req.body;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID não associado ao usuário.' });
  }
  if (!plano_id) {
    return res.status(400).json({ error: 'ID do plano desejado não fornecido.' });
  }

  try {
    const [arena, novoPlano] = await Promise.all([
      db.getAsync('SELECT id, nome, plano_id, status FROM Arenas WHERE id = ?', [tenantId]),
      db.getAsync('SELECT * FROM PlanosSaaS WHERE id = ?', [plano_id])
    ]);

    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }
    if (!novoPlano) {
      return res.status(404).json({ error: 'Plano solicitado não encontrado.' });
    }

    await validarCapacidadeNovoPlano(tenantId, novoPlano);

    const { cicloEscolhido, valorFinal, descricaoFinal } = calcularValoresUpgradePlano(novoPlano, ciclo);
    const hoje = new Date().toISOString().split('T')[0];

    const faturaId = await obterOuCriarFaturaUpgrade({
      tenantId,
      novoPlano,
      valorFinal,
      cicloEscolhido,
      descricaoFinal,
      hoje
    });

    const pixData = await saasBillingService.gerarPixFaturaSaaS(faturaId);

    logAuditEvent(
      req.user.id,
      'SaaS: Solicitação de Upgrade',
      `Arena '${arena.nome}' (ID: ${tenantId}) solicitou upgrade para o Plano ${novoPlano.nome} (Ciclo: ${cicloEscolhido}, Fatura #${faturaId}, Valor: R$ ${valorFinal}).`,
      req.headers['x-forwarded-for'] || req.ip
    );

    res.json({
      fatura_id: faturaId,
      valor: valorFinal,
      ciclo: cicloEscolhido,
      descricao: descricaoFinal,
      plano_nome: novoPlano.nome,
      pix: pixData
    });
  } catch (err) {
    console.error('[Solicitar Upgrade Error]', err);
    res.status(400).json({ error: err.message || 'Erro ao processar solicitação de upgrade.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.1 POST /api/tenant/assinatura/adiantar-fatura
// Permite que o gestor gere e pague a próxima fatura do plano antecipadamente.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/adiantar-fatura', async (req, res) => {
  const tenantId = req.user.tenant_id;
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID não associado ao usuário.' });
  }

  try {
    const arena = await db.getAsync(`
      SELECT a.id, a.nome, a.plano_id, a.dia_vencimento, a.ciclo_cobranca,
             p.id as plano_id_real, p.nome as plano_nome, p.valor_mensal, p.valor_anual
      FROM Arenas a
      JOIN PlanosSaaS p ON a.plano_id = p.id
      WHERE a.id = ?
    `, [tenantId]);

    if (!arena) {
      return res.status(404).json({ error: 'Arena ou plano não encontrado.' });
    }

    const ciclo = arena.ciclo_cobranca || 'mensal';
    let valorFinal = arena.valor_mensal;

    if (ciclo === 'anual') {
      const precoMensalAnual = (arena.valor_anual && arena.valor_anual > 0)
        ? arena.valor_anual
        : (arena.valor_mensal * 0.8);
      valorFinal = Number.parseFloat((precoMensalAnual * 12).toFixed(2));
    }

    // 1. Verificar se já existe uma fatura pendente/atrasada (Idempotência)
    let faturaPendente = await db.getAsync(`
      SELECT id, valor, plano_id, status, data_vencimento, ciclo, descricao
      FROM FaturasSaaS
      WHERE tenant_id = ? AND status IN ('Pendente', 'Atrasada')
      ORDER BY data_vencimento ASC, id ASC
      LIMIT 1
    `, [tenantId]);

    let faturaId;
    let dataVencimento;
    let descricaoFinal;

    if (faturaPendente) {
      // Reutiliza a fatura pendente existente
      faturaId = faturaPendente.id;
      dataVencimento = faturaPendente.data_vencimento;
      descricaoFinal = faturaPendente.descricao || `Assinatura Plano ${arena.plano_nome} - ${formatarCompetencia(dataVencimento, faturaPendente.ciclo || ciclo)}`;
    } else {
      // Busca a última fatura existente da arena para avançar +1 ciclo a partir dela
      const ultimaFaturaExistente = await db.getAsync(`
        SELECT data_vencimento, ciclo
        FROM FaturasSaaS
        WHERE tenant_id = ?
        ORDER BY data_vencimento DESC, id DESC
        LIMIT 1
      `, [tenantId]);

      const dia = arena.dia_vencimento || 10;
      if (ultimaFaturaExistente && ultimaFaturaExistente.data_vencimento) {
        // Avança exatamente 1 ciclo a partir da última fatura registrada
        dataVencimento = calcularProximaDataVencimento(ultimaFaturaExistente.data_vencimento, dia, ciclo);
      } else {
        // Primeira fatura da arena: calcula a partir da data atual
        dataVencimento = calcularProximaDataVencimento(null, dia, ciclo);
      }

      const competenciaNome = formatarCompetencia(dataVencimento, ciclo);
      descricaoFinal = `Assinatura Plano ${arena.plano_nome} - ${competenciaNome} (Antecipada)`;

      // Insere nova fatura antecipada
      const result = await db.runAsync(`
        INSERT INTO FaturasSaaS (tenant_id, plano_id, valor, ciclo, descricao, data_vencimento, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Pendente')
      `, [tenantId, arena.plano_id, valorFinal, ciclo, descricaoFinal, dataVencimento]);
      faturaId = result.lastID;
    }

    // 2. Gerar cobrança Pix
    const pixData = await saasBillingService.gerarPixFaturaSaaS(faturaId);

    // 3. Log de auditoria
    logAuditEvent(
      req.user.id,
      'SaaS: Adiantamento de Fatura',
      `Arena '${arena.nome}' (ID: ${tenantId}) solicitou adiantamento da fatura #${faturaId} de R$ ${valorFinal} (Vencimento: ${dataVencimento}, Descrição: ${descricaoFinal}).`,
      req.headers['x-forwarded-for'] || req.ip
    );

    res.json({
      fatura_id: faturaId,
      valor: valorFinal,
      ciclo: ciclo,
      descricao: descricaoFinal,
      data_vencimento: dataVencimento,
      competencia: formatarCompetencia(dataVencimento, ciclo),
      plano_nome: arena.plano_nome,
      pix: pixData
    });
  } catch (err) {
    console.error('[Adiantar Fatura Error]', err);
    res.status(400).json({ error: err.message || 'Erro ao processar adiantamento de fatura.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. GET /api/tenant/assinatura/faturas/:id/recibo
// Retorna os dados completos da fatura liquidada para visualização/impressão do recibo.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/faturas/:id/recibo', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const faturaId = Number.parseInt(req.params.id, 10);

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID não associado ao usuário.' });
  }

  try {
    const fatura = await db.getAsync(`
      SELECT f.id, f.valor, f.data_vencimento, f.data_pagamento, f.status,
             f.gateway_ref, f.metodo_pagamento, f.ciclo, f.descricao,
             p.nome as plano_nome, p.max_quadras, p.max_usuarios,
             a.nome as arena_nome, a.email as arena_email, a.telefone as arena_telefone, a.endereco as arena_endereco, a.slug as arena_slug
      FROM FaturasSaaS f
      JOIN PlanosSaaS p ON f.plano_id = p.id
      JOIN Arenas a ON f.tenant_id = a.id
      WHERE f.id = ? AND f.tenant_id = ?
    `, [faturaId, tenantId]);

    if (!fatura) {
      return res.status(404).json({ error: 'Fatura não encontrada.' });
    }
    if (!fatura.status || fatura.status.toLowerCase() !== 'paga') {
      return res.status(400).json({ error: 'O recibo só fica disponível após a confirmação do pagamento.' });
    }

    const valorNumerico = Number.parseFloat(fatura.valor) || 0;

    res.json({
      recibo_numero: `REC-${String(fatura.id).padStart(6, '0')}`,
      data_emissao: new Date().toISOString(),
      fatura: {
        id: fatura.id,
        valor: valorNumerico,
        ciclo: fatura.ciclo || 'mensal',
        descricao: fatura.descricao || `Assinatura Plano ${fatura.plano_nome}`,
        data_vencimento: fatura.data_vencimento,
        data_pagamento: fatura.data_pagamento,
        metodo_pagamento: fatura.metodo_pagamento || 'Pix Online',
        gateway_ref: fatura.gateway_ref || `AUTH-${fatura.id}-${Date.now()}`,
        status: fatura.status
      },
      plano: {
        nome: fatura.plano_nome,
        max_quadras: fatura.max_quadras,
        max_usuarios: fatura.max_usuarios
      },
      arena: {
        nome: fatura.arena_nome,
        email: fatura.arena_email,
        telefone: fatura.arena_telefone,
        endereco: fatura.arena_endereco,
        slug: fatura.arena_slug
      },
      emissor: {
        empresa: 'Arenix SaaS — Gestão de Arenas Esportivas',
        sistema: 'Arenix CourtManager Platform',
        cnpj: '00.000.000/0001-00',
        suporte: 'suporte@arenix.com.br'
      }
    });
  } catch (err) {
    console.error('[Tenant Assinatura Recibo Error]', err);
    res.status(500).json({ error: 'Erro ao gerar recibo da fatura.' });
  }
});

module.exports = router;
