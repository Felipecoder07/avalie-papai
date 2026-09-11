const db = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require("node:crypto");
const logAuditEvent = require('../utils/auditLogger');
const saasBillingService = require('../services/saasBillingService');

const getArenas = async (req, res) => {
  try {
    const arenas = await db.allAsync(`
      SELECT 
        a.id, 
        a.nome, 
        a.slug,
        COALESCE(a.email, (SELECT email FROM Usuarios WHERE tenant_id = a.id AND perfil = 'Administrador' LIMIT 1)) AS email, 
        a.status,
        a.criado_em,
        a.plano_id,
        a.dia_vencimento,
        p.nome as plano_nome,
        (SELECT COUNT(*) FROM Usuarios WHERE tenant_id = a.id AND perfil = 'Administrador') as admins,
        (SELECT COUNT(*) FROM FaturasSaaS WHERE tenant_id = a.id AND status = 'Atrasada') as faturas_atrasadas,
        CASE WHEN a.gateway_access_token IS NOT NULL AND a.gateway_access_token != '' THEN 1 ELSE 0 END AS gateway_conectado
      FROM Arenas a
      LEFT JOIN PlanosSaaS p ON a.plano_id = p.id
      WHERE a.status != -1
      ORDER BY a.criado_em DESC
    `);
    res.json(arenas);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar arenas.' });
  }
};

const getMetrics = async (req, res) => {
  try {
    const totalArenas = await db.getAsync(`SELECT COUNT(*) as total FROM Arenas WHERE status != -1`);
    const arenasAtivas = await db.getAsync(`SELECT COUNT(*) as total FROM Arenas WHERE status = 1`);
    const arenasBloqueadas = await db.getAsync(`SELECT COUNT(*) as total FROM Arenas WHERE status = 0`);
    const totalClientes = await db.getAsync(`SELECT COUNT(*) as total FROM Clientes`);
    const totalQuadras = await db.getAsync(`SELECT COUNT(*) as total FROM Quadras`);
    const mrr = await db.getAsync(`
      SELECT SUM(p.valor_mensal) as valor 
      FROM Arenas a 
      JOIN PlanosSaaS p ON a.plano_id = p.id 
      WHERE a.status = 1 AND (a.trial_expira_em IS NULL OR date(a.trial_expira_em) <= date('now'))
    `);

    // 1. Arenas em Trial (criadas nos últimos 14 dias e ativas)
    const arenasTrial = await db.getAsync(`
      SELECT COUNT(*) as total 
      FROM Arenas 
      WHERE status = 1 AND criado_em >= date('now', '-14 days')
    `);

    // 2. Churn nos últimos 30 dias (arenas deletadas / total)
    const deletadas30d = await db.getAsync(`
      SELECT COUNT(*) as total 
      FROM Arenas 
      WHERE status = -1 AND criado_em >= date('now', '-30 days')
    `);
    const totalAtivasNum = arenasAtivas.total || 0;
    const deletadasNum = deletadas30d.total || 0;
    const churn = totalAtivasNum > 0 ? ((deletadasNum / (totalAtivasNum + deletadasNum)) * 100) : 0;

    // 3. Reservas: Hoje, Esta Semana, Este Mês
    const reservasHoje = await db.getAsync(`
      SELECT COUNT(*) as total 
      FROM Reservas 
      WHERE data_reserva = date('now')
    `);
    const reservasSemana = await db.getAsync(`
      SELECT COUNT(*) as total 
      FROM Reservas 
      WHERE data_reserva >= date('now', '-7 days')
    `);
    const reservasMes = await db.getAsync(`
      SELECT COUNT(*) as total 
      FROM Reservas 
      WHERE data_reserva >= date('now', 'start of month')
    `);

    // 4. Gráfico de crescimento (Arenas criadas por mês nos últimos 12 meses)
    const historicoArenas = await db.allAsync(`
      SELECT strftime('%Y-%m', criado_em) as month, COUNT(*) as count 
      FROM Arenas 
      WHERE status != -1 AND criado_em >= date('now', '-12 months')
      GROUP BY month 
      ORDER BY month ASC
    `);

    // 5. Novas métricas de tendência (Real)
    // A. Variação de Reservas (Hoje vs Ontem)
    const reservasOntem = await db.getAsync(`
      SELECT COUNT(*) as total 
      FROM Reservas 
      WHERE data_reserva = date('now', '-1 day')
    `);
    const tReservas = reservasHoje.total || 0;
    const yReservas = reservasOntem.total || 0;
    let reservasVariacao = 0;
    if (yReservas > 0) {
      reservasVariacao = Math.round(((tReservas - yReservas) / yReservas) * 100);
    } else if (tReservas > 0) {
      reservasVariacao = 100;
    }

    // B. Novos Clientes nos últimos 30 dias
    const novosClientes30d = await db.getAsync(`
      SELECT COUNT(*) as total 
      FROM Clientes 
      WHERE criado_em >= date('now', '-30 days')
    `);

    // C. Variação de MRR (Faturamento deste mês vs anterior)
    const mrrNovoEsteMes = await db.getAsync(`
      SELECT SUM(p.valor_mensal) as valor 
      FROM Arenas a 
      JOIN PlanosSaaS p ON a.plano_id = p.id 
      WHERE a.status = 1 AND a.criado_em >= date('now', 'start of month')
    `);
    const mrrAtualVal = mrr.valor || 0;
    const mrrNovoVal = mrrNovoEsteMes.valor || 0;
    const mrrAnteriorVal = mrrAtualVal - mrrNovoVal;
    let mrrVariacao = 0;
    if (mrrAnteriorVal > 0) {
      mrrVariacao = Number.parseFloat(((mrrNovoVal / mrrAnteriorVal) * 100).toFixed(1));
    } else if (mrrNovoVal > 0) {
      mrrVariacao = 100;
    }

    // 6. Histórico de faturamento real (últimos 6 meses de faturas pagas)
    const faturamentoHistorico = await db.allAsync(`
      SELECT strftime('%Y-%m', data_vencimento) as month, SUM(valor) as total 
      FROM FaturasSaaS 
      WHERE status = 'Paga' 
      GROUP BY month 
      ORDER BY month ASC 
      LIMIT 6
    `);

    res.json({
      totalArenas: totalArenas.total,
      arenasAtivas: arenasAtivas.total,
      arenasBloqueadas: arenasBloqueadas.total,
      totalClientes: totalClientes.total,
      totalQuadras: totalQuadras.total,
      totalReceitaSaaS: mrr.valor || 0,
      arenasTrial: arenasTrial.total,
      churnRate: Number.parseFloat(churn.toFixed(1)),
      reservasHoje: reservasHoje.total,
      reservasSemana: reservasSemana.total,
      reservasMes: reservasMes.total,
      growthChart: historicoArenas,
      reservasVariacao,
      clientesNovos30d: novosClientes30d.total,
      mrrVariacao,
      faturamentoHistorico
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar métricas.' });
  }
};

const createArena = async (req, res) => {
  const { nome, email, telefone, endereco, plano_id, dia_vencimento, trial_dias, senha } = req.body;

  if (!nome || !email) {
    return res.status(400).json({ error: 'Nome da arena e e-mail do responsável são obrigatórios.' });
  }

  try {
    const planoIdFinal = Number.parseInt(plano_id, 10) || 1;
    const diasTrialFinal = trial_dias !== undefined ? Number.parseInt(trial_dias, 10) : 14;
    const trialExpiraEm = diasTrialFinal > 0
      ? new Date(Date.now() + diasTrialFinal * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : null;

    let diaVencimentoFinal = Number.parseInt(dia_vencimento, 10);
    if (!diaVencimentoFinal || isNaN(diaVencimentoFinal)) {
      if (trialExpiraEm) {
        diaVencimentoFinal = Number.parseInt(trialExpiraEm.split('-')[2], 10);
      } else {
        diaVencimentoFinal = new Date().getUTCDate();
      }
    }

    const cleanSlug = (nome || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const finalSlug = cleanSlug || `arena-${Date.now()}`;

    const resArena = await db.runAsync(`
      INSERT INTO Arenas (nome, slug, telefone, endereco, plano_id, dia_vencimento, trial_expira_em, status, ciclo_cobranca)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'mensal')
    `, [nome.trim(), finalSlug, telefone || null, endereco || null, planoIdFinal, diaVencimentoFinal, trialExpiraEm]);

    const tenantId = resArena.lastID;

    const bcrypt = require('bcrypt');
    const senhaHash = await bcrypt.hash(senha || 'Arenix@2026', 12);
    await db.runAsync(`
      INSERT INTO Usuarios (nome, email, senha_hash, perfil, tenant_id)
      VALUES (?, ?, ?, 'Administrador', ?)
    `, [`Admin ${nome}`, email.trim().toLowerCase(), senhaHash, tenantId]);

    logAuditEvent(req.user.id, 'SaaS: Arena Criada', `Arena '${nome}' (ID: ${tenantId}) cadastrada com plano ID: ${planoIdFinal}`, req.ip);

    res.status(201).json({ message: 'Arena cadastrada com sucesso.', id: tenantId });
  } catch (err) {
    console.error('Erro ao criar arena pelo Master:', err);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'E-mail do responsável já cadastrado no sistema.' });
    }
    res.status(500).json({ error: 'Erro ao cadastrar arena.' });
  }
};

const toggleArenaStatus = async (req, res) => {
  const { id } = req.params;
  const { status, senha } = req.body; 
  const superAdminId = req.user.id;

  if (status === undefined) {
    return res.status(400).json({ error: 'Status não fornecido.' });
  }

  if (!senha) {
    return res.status(400).json({ error: 'Senha do Master é obrigatória.' });
  }

  try {
    const master = await db.getAsync('SELECT senha_hash FROM Usuarios WHERE id = ? AND perfil = ?', [superAdminId, 'SuperAdmin']);
    if (!master) return res.status(403).json({ error: 'Usuário master inválido.' });

    const isValid = await bcrypt.compare(senha, master.senha_hash);
    if (!isValid) return res.status(401).json({ error: 'Senha incorreta. Ação negada.' });

    await db.runAsync(`UPDATE Arenas SET status = ? WHERE id = ?`, [status, id]);
    logAuditEvent(req.user.id, 'SaaS: Status Alterado', `Arena ID: ${id}, Novo Status: ${status === 1 ? 'Ativa' : 'Bloqueada'}`, req.ip);
    res.json({ message: 'Status da arena atualizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status da arena.' });
  }
};

const getArenaById = async (req, res) => {
  const { id } = req.params;
  try {
    const arena = await db.getAsync(`
      SELECT a.id, a.nome, a.email, a.telefone, a.endereco, a.status, a.criado_em, a.plano_id, a.dia_vencimento, p.nome as plano_nome,
        CASE WHEN a.gateway_access_token IS NOT NULL AND a.gateway_access_token != '' THEN 1 ELSE 0 END AS gateway_conectado
      FROM Arenas a 
      LEFT JOIN PlanosSaaS p ON a.plano_id = p.id
      WHERE a.id = ? AND a.status != -1
    `, [id]);
    if (!arena) return res.status(404).json({ error: 'Arena não encontrada.' });

    const totais = await db.getAsync(`SELECT COUNT(*) as total FROM Quadras WHERE tenant_id = ?`, [id]);
    const clientes = await db.getAsync(`SELECT COUNT(*) as total FROM Clientes WHERE tenant_id = ?`, [id]);
    
    // Buscar todos os usuários do tipo staff (não clientes) para popular a aba do master
    const users = await db.allAsync(`
      SELECT id, nome, email, perfil, ativo, criado_em 
      FROM Usuarios 
      WHERE tenant_id = ? AND perfil != 'Cliente'
    `, [id]);
    
    const mappedUsers = users.map(u => ({
      id: String(u.id),
      name: u.nome,
      email: u.email,
      role: u.perfil === 'Administrador' ? 'admin' : u.perfil === 'Gerente' ? 'gerente' : 'recepcionista',
      status: u.ativo === 1 ? 'ativa' : 'bloqueada',
      lastAccess: u.criado_em
    }));

    // Buscar logs de auditoria recentes específicos desta arena
    const logs = await db.allAsync(`
      SELECT l.id, l.evento as action, l.detalhes, l.ip, l.criado_em as at, u.nome as actor
      FROM LogsAuditoria l
      LEFT JOIN Usuarios u ON l.usuario_id = u.id
      WHERE l.tenant_id = ?
      ORDER BY l.criado_em DESC
      LIMIT 100
    `, [id]);

    const mappedLogs = logs.map(l => ({
      id: String(l.id),
      arenaId: id,
      action: l.action + (l.detalhes ? ` - ${l.detalhes}` : ''),
      at: l.at,
      actor: l.actor || 'Sistema',
      ip: l.ip || '0.0.0.0'
    }));

    logAuditEvent(req.user.id, 'SaaS: Inspeção de Arena', `Modo inspeção aberto para Arena ID: ${id}`, req.ip);

    res.json({
      ...arena,
      quadras: totais ? totais.total : 0,
      clientes: clientes ? clientes.total : 0,
      administradores: mappedUsers.filter(u => u.role === 'admin'),
      usuarios: mappedUsers,
      logs: mappedLogs
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar detalhes da arena.' });
  }
};

const updateArena = async (req, res) => {
  const { id } = req.params;
  const { nome, email, telefone, endereco, dia_vencimento } = req.body;

  if (!nome) return res.status(400).json({ error: 'Nome da arena é obrigatório.' });

  try {
    let query = 'UPDATE Arenas SET nome = ?, email = ?, telefone = ?, endereco = ? WHERE id = ? AND status != -1';
    let params = [nome, email || null, telefone || null, endereco || null, id];

    if (dia_vencimento) {
      query = 'UPDATE Arenas SET nome = ?, email = ?, telefone = ?, endereco = ?, dia_vencimento = ? WHERE id = ? AND status != -1';
      params = [nome, email || null, telefone || null, endereco || null, dia_vencimento, id];
    }

    await db.runAsync(query, params);
    
    logAuditEvent(req.user.id, 'SaaS: Arena Editada', `Arena ID: ${id}, Novo Nome: ${nome}`, req.ip);

    res.json({ message: 'Arena atualizada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar arena.' });
  }
};

const deleteArena = async (req, res) => {
  const { id } = req.params;
  const { senha_master } = req.body;
  const superAdminId = req.user.id;

  if (!senha_master) return res.status(400).json({ error: 'Senha do Master é obrigatória.' });

  try {
    const master = await db.getAsync('SELECT senha_hash FROM Usuarios WHERE id = ? AND perfil = ?', [superAdminId, 'SuperAdmin']);
    if (!master) return res.status(403).json({ error: 'Usuário master inválido.' });

    const isValid = await bcrypt.compare(senha_master, master.senha_hash);
    if (!isValid) return res.status(401).json({ error: 'Senha incorreta. Exclusão negada.' });

    await db.runAsync('UPDATE Arenas SET status = -1 WHERE id = ?', [id]);
    await db.runAsync('DELETE FROM SessoesAtivas WHERE tenant_id = ?', [id]);
    await db.runAsync("UPDATE Usuarios SET ativo = 0, email = email || '__deleted_' || strftime('%s','now') WHERE tenant_id = ? AND email NOT LIKE '%__deleted_%'", [id]);
    
    logAuditEvent(req.user.id, 'SaaS: Arena Excluída (Soft Delete, Liberação de E-mail e Limpeza de Sessões)', `Arena ID: ${id}`, req.ip);

    res.json({ message: 'Arena excluída (soft-delete) com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir arena.' });
  }
};

// --- MÓDULO FINANCEIRO (BILLING) ---

const getPlanosSaaS = async (req, res) => {
  try {
    const planos = await db.allAsync('SELECT * FROM PlanosSaaS ORDER BY valor_mensal ASC');
    res.json(planos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar planos.' });
  }
};

const updateArenaPlan = async (req, res) => {
  const { id } = req.params;
  const { plano_id } = req.body;

  if (!plano_id) return res.status(400).json({ error: 'Plano não fornecido.' });

  try {
    const novoPlano = await db.getAsync('SELECT max_quadras, max_usuarios, nome FROM PlanosSaaS WHERE id = ?', [plano_id]);
    if (!novoPlano) return res.status(404).json({ error: 'Plano não encontrado.' });

    const quadrasAtuais = await db.getAsync('SELECT COUNT(*) as total FROM Quadras WHERE tenant_id = ?', [id]);
    const usuariosAtuais = await db.getAsync("SELECT COUNT(*) as total FROM Usuarios WHERE tenant_id = ? AND perfil != 'Cliente'", [id]);

    if (quadrasAtuais.total > novoPlano.max_quadras) {
      return res.status(400).json({ 
        error: `A arena possui ${quadrasAtuais.total} quadras, o que excede o limite do plano ${novoPlano.nome} (${novoPlano.max_quadras}). Remova as quadras excedentes antes de fazer o downgrade.`
      });
    }

    if (usuariosAtuais.total > novoPlano.max_usuarios) {
      return res.status(400).json({ 
        error: `A arena possui ${usuariosAtuais.total} usuários cadastrados, o que excede o limite do plano ${novoPlano.nome} (${novoPlano.max_usuarios}). Remova os usuários excedentes antes de fazer o downgrade.`
      });
    }

    await db.runAsync('UPDATE Arenas SET plano_id = ? WHERE id = ?', [plano_id, id]);
    logAuditEvent(req.user.id, 'SaaS: Plano Alterado', `Arena ID: ${id}, Novo Plano ID: ${plano_id}`, req.ip);
    
    res.json({ message: 'Plano da arena atualizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar plano.' });
  }
};

const getFaturasSaaS = async (req, res) => {
  const { id } = req.params;
  try {
    const faturas = await db.allAsync(`
      SELECT f.*, p.nome as plano_nome 
      FROM FaturasSaaS f 
      JOIN PlanosSaaS p ON f.plano_id = p.id
      WHERE f.tenant_id = ? 
      ORDER BY f.data_vencimento DESC
    `, [id]);
    res.json(faturas);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar faturas.' });
  }
};

const payFaturaSaaS = async (req, res) => {
  const { id } = req.params; // ID da fatura
  const superAdminId = req.user.id;
  const today = new Date().toISOString().split('T')[0];

  try {
    const fatura = await db.getAsync('SELECT tenant_id, status FROM FaturasSaaS WHERE id = ?', [id]);
    if (!fatura) return res.status(404).json({ error: 'Fatura não encontrada.' });
    if (fatura.status === 'Paga') return res.status(400).json({ error: 'Fatura já está paga.' });

    await db.runAsync(`
      UPDATE FaturasSaaS 
      SET status = 'Paga', data_pagamento = ?, registrado_por = ?, metodo_pagamento = 'Manual'
      WHERE id = ?
    `, [today, superAdminId, id]);

    logAuditEvent(superAdminId, 'SaaS: Fatura Paga', `Fatura #${id} marcada como paga manualmente (Arena ID: ${fatura.tenant_id})`, req.ip);

    // Auto-desbloqueio da arena se ela estivesse suspensa por falta de pagamento
    const arena = await db.getAsync('SELECT status, nome FROM Arenas WHERE id = ?', [fatura.tenant_id]);
    let arenaReativada = false;
    if (arena && arena.status === 0) {
      await db.runAsync('UPDATE Arenas SET status = 1 WHERE id = ?', [fatura.tenant_id]);
      arenaReativada = true;
      logAuditEvent(superAdminId, 'SaaS: Arena Desbloqueada Automática', `Arena '${arena.nome}' (ID: ${fatura.tenant_id}) reativada após quitação da Fatura #${id}`, req.ip);
    }
    
    res.json({ 
      message: arenaReativada 
        ? 'Pagamento registrado com sucesso. A arena foi reativada automaticamente!' 
        : 'Pagamento registrado com sucesso.' 
    });
  } catch (err) {
    console.error('[payFaturaSaaS Error]', err);
    res.status(500).json({ error: 'Erro ao registrar pagamento.' });
  }
};

/**
 * Obtém o segredo do Webhook do Mercado Pago Master configurado no banco ou .env.
 */
const getMasterWebhookSecret = async () => {
  const row = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'mp_webhook_secret'");
  if (row && row.valor && row.valor.trim() !== '') {
    return row.valor.trim();
  }
  if (process.env.MERCADO_PAGO_WEBHOOK_SECRET && process.env.MERCADO_PAGO_WEBHOOK_SECRET.trim() !== '') {
    return process.env.MERCADO_PAGO_WEBHOOK_SECRET.trim();
  }
  if (process.env.MP_WEBHOOK_SECRET && process.env.MP_WEBHOOK_SECRET.trim() !== '') {
    return process.env.MP_WEBHOOK_SECRET.trim();
  }
  return null;
};

/**
 * Valida a autenticidade da notificação de Webhook do Mercado Pago via HMAC-SHA256.
 * Utiliza crypto.timingSafeEqual para prevenção contra timing attacks.
 */
function verificarAssinaturaMP(req, secret) {
  if (!secret) return false;
  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'] || '';

  if (!xSignature) return false;

  const parts = {};
  xSignature.split(',').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k && v.length) {
      parts[k.trim()] = v.join('=').trim();
    }
  });

  const ts = parts['ts'] || parts['t'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  // Proteção contra Replay Attacks: tolerância máxima de 15 minutos (900 segundos)
  const nowSec = Math.floor(Date.now() / 1000);
  const tsNum = Number.parseInt(ts, 10);
  if (isNaN(tsNum) || Math.abs(nowSec - tsNum) > 900) {
    console.warn(`[SaaS Webhook] Rejeitado por Replay Attack / Timestamp expirado: ts=${ts}, now=${nowSec}`);
    return false;
  }

  const dataId = req.body?.data?.id || req.query?.id || req.query?.['data.id'] || req.body?.id || '';
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  const hmac = crypto.createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  try {
    const hmacBuf = Buffer.from(hmac, 'hex');
    const v1Buf = Buffer.from(v1, 'hex');
    if (hmacBuf.length !== v1Buf.length) {
      return false;
    }
    return crypto.timingSafeEqual(hmacBuf, v1Buf);
  } catch (err) {
    return false;
  }
}

/**
 * Webhook público do Mercado Pago para notificação de pagamentos de mensalidade do SaaS Master.
 * Rota: POST /api/saas/webhook-pagamento
 */
const handleSaaSWebhook = async (req, res) => {
  try {
    const rawPaymentId = req.body?.data?.id || req.query?.id || req.query?.['data.id'] || req.body?.id;

    if (!rawPaymentId) {
      return res.status(200).send('OK (sem payment_id)');
    }

    const paymentIdStr = String(rawPaymentId).trim();
    if (!/^\d+$/.test(paymentIdStr)) {
      console.warn('[SaaS Webhook] paymentId rejeitado por formato não numérico');
      return res.status(200).send('OK (payment_id ignorado)');
    }
    const paymentId = encodeURIComponent(paymentIdStr);

    console.log(`[SaaS Webhook] Recebida notificação para paymentId: ${paymentId}`);

    // Validação de Segurança: HMAC Webhook Signature
    const webhookSecret = await getMasterWebhookSecret();
    if (webhookSecret) {
      const isValid = verificarAssinaturaMP(req, webhookSecret);
      if (!isValid) {
        const safeIp = String(req.ip || '').replace(/[\r\n]/g, '');
        console.warn(`[SaaS Webhook] Rejeitado: Assinatura HMAC inválida para paymentId ${paymentId} (IP: ${safeIp})`);
        logAuditEvent(
          0,
          'SaaS: Webhook Forjado Rejeitado',
          `Tentativa de notificação de webhook com assinatura HMAC inválida (IP: ${safeIp}, Payment ID: ${paymentId})`,
          safeIp
        );
        return res.status(400).json({ error: 'Assinatura de webhook HMAC inválida.' });
      }
    } else {
      console.warn('[SaaS Webhook] Aviso: mp_webhook_secret não configurado. Processando notificação em modo de compatibilidade/desenvolvimento.');
    }

    const token = await saasBillingService.getMasterAccessToken();
    if (!token) {
      console.warn('[SaaS Webhook] Token Master não configurado.');
      return res.status(200).send('OK (sem token master)');
    }

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const mpPayment = await response.json();
      if (mpPayment.status === 'approved') {
        const resultado = await saasBillingService.liquidarFaturaSaaS(String(paymentId));
        console.log(`[SaaS Webhook] Resultado da liquidação:`, resultado);
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[SaaS Webhook Exception]', err);
    return res.status(200).send('OK'); // MP requer resposta 200 OK para aceitar a entrega
  }
};

const getAllFaturasSaaS = async (req, res) => {
  try {
    const faturas = await db.allAsync(`
      SELECT f.*, p.nome as plano_nome, a.nome as arena_nome
      FROM FaturasSaaS f
      JOIN PlanosSaaS p ON f.plano_id = p.id
      JOIN Arenas a ON f.tenant_id = a.id
      ORDER BY f.data_vencimento DESC
    `);
    res.json(faturas);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar todas as faturas.' });
  }
};

const getAuditoriaMaster = async (req, res) => {
  try {
    // Busca os últimos 500 logs globais para o Master
    const logs = await db.allAsync(`
      SELECT l.*, u.nome as usuario_nome, u.email as usuario_email, a.nome as arena_nome
      FROM LogsAuditoria l
      LEFT JOIN Usuarios u ON l.usuario_id = u.id
      LEFT JOIN Arenas a ON l.tenant_id = a.id
      ORDER BY l.criado_em DESC
      LIMIT 500
    `);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar auditoria global.' });
  }
};

const updatePlanoSaaS = async (req, res) => {
  const { id } = req.params;
  let { nome, max_quadras, max_usuarios, valor_mensal, valor_anual } = req.body;

  // Fallback seguro de valores numéricos para evitar erros de validação
  if (max_quadras === null || max_quadras === undefined || isNaN(Number(max_quadras))) max_quadras = 0;
  if (max_usuarios === null || max_usuarios === undefined || isNaN(Number(max_usuarios))) max_usuarios = 0;
  if (valor_mensal === null || valor_mensal === undefined || isNaN(Number(valor_mensal))) valor_mensal = 0;
  if (valor_anual === null || valor_anual === undefined || isNaN(Number(valor_anual))) valor_anual = 0;

  if (!nome || nome.trim() === '') {
    return res.status(400).json({ error: 'O nome do plano é obrigatório.' });
  }

  if (valor_mensal !== undefined && Number(valor_mensal) < 0) {
    return res.status(400).json({ error: 'O valor mensal do plano não pode ser negativo.' });
  }

  try {
    await db.runAsync(`
      UPDATE PlanosSaaS 
      SET nome = ?, max_quadras = ?, max_usuarios = ?, valor_mensal = ?, valor_anual = ? 
      WHERE id = ?
    `, [nome, max_quadras, max_usuarios, valor_mensal, valor_anual, id]);

    logAuditEvent(req.user.id, 'SaaS: Plano Editado', `Plano ID: ${id}, Nome: ${nome}, Valor: ${valor_mensal}, Anual: ${valor_anual}`, req.ip);
    res.json({ message: 'Plano atualizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar plano.' });
  }
};

// Helper para decodificar chave Base32 usada no 2FA (TOTP)
function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let hex = '';
  for (let i = 0; i < base32.length; i++) {
    const val = alphabet.indexOf(base32.charAt(i).toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    const chunk = bits.substring(i, i + 8);
    hex = hex + Number.parseInt(chunk, 2).toString(16).padStart(2, '0');
  }
  return Buffer.from(hex, 'hex');
}

// Validador TOTP de 6 dígitos baseado em tempo (janela de aceitação de 30s)
function verifyTOTP(secret, code, window = 1) {
  try {
    const key = base32Decode(secret);
    const epoch = Math.round(new Date().getTime() / 1000.0);
    const timeStep = Math.floor(epoch / 30);

    for (let i = -window; i <= window; i++) {
      const step = timeStep + i;
      const timeBuffer = Buffer.alloc(8);
      timeBuffer.writeUInt32BE(Math.floor(step / 0x100000000), 0);
      timeBuffer.writeUInt32BE(step & 0xffffffff, 4);

      const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();
      const offset = hmac[hmac.length - 1] & 0xf;
      const binary = ((hmac[offset] & 0x7f) << 24) |
                     ((hmac[offset + 1] & 0xff) << 16) |
                     ((hmac[offset + 2] & 0xff) << 8) |
                     (hmac[offset + 3] & 0xff);

      const otp = (binary % 1000000).toString().padStart(6, '0');
      if (otp === code) {
        return true;
      }
    }
  } catch (err) {
    console.error('Erro na validação TOTP:', err);
  }
  return false;
}

const getActiveSessions = async (req, res) => {
  try {
    // Retorna sessões ativas nos últimos 15 minutos
    const sessions = await db.allAsync(`
      SELECT s.tenant_id as arenaId, a.nome as arenaName, COUNT(DISTINCT s.usuario_id) as users, MIN(s.criado_em) as since
      FROM SessoesAtivas s
      LEFT JOIN Arenas a ON s.tenant_id = a.id
      WHERE s.ultimo_acesso >= datetime('now', '-15 minutes')
      GROUP BY s.tenant_id
    `);

    const formattedSessions = sessions.map(s => ({
      arenaId: s.arenaId || 0,
      arenaName: s.arenaName || 'Painel Administrativo Master',
      users: s.users,
      since: s.since
    }));

    res.json(formattedSessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar sessões ativas.' });
  }
};

const changeMasterPassword = async (req, res) => {
  const superAdminId = req.user.id;
  const { senha_atual, nova_senha, codigo_2fa } = req.body;

  if (!senha_atual || !nova_senha || !codigo_2fa) {
    return res.status(400).json({ error: 'Todos os campos (senha atual, nova senha e código 2FA) são obrigatórios.' });
  }

  if (nova_senha.length < 8) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres.' });
  }

  try {
    const user = await db.getAsync('SELECT senha_hash, two_factor_secret FROM Usuarios WHERE id = ?', [superAdminId]);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const senhaValida = await bcrypt.compare(senha_atual, user.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ error: 'A senha atual informada está incorreta.' });
    }

    const novaSenhaIgual = await bcrypt.compare(nova_senha, user.senha_hash);
    if (novaSenhaIgual) {
      return res.status(400).json({ error: 'A nova senha não pode ser idêntica à senha atual.' });
    }

    const secret = user.two_factor_secret || 'JBSWY3DPEHPK3PXP';
    const is2faValido = verifyTOTP(secret, codigo_2fa.trim());
    if (!is2faValido) {
      return res.status(401).json({ error: 'O código 2FA fornecido é inválido ou expirou.' });
    }

    const hash = await bcrypt.hash(nova_senha, 12);
    await db.runAsync('UPDATE Usuarios SET senha_hash = ? WHERE id = ?', [hash, superAdminId]);

    logAuditEvent(superAdminId, 'SaaS: Senha Alterada', 'Senha master alterada com confirmação de 2FA', req.ip);

    res.json({ message: 'Senha master alterada com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao alterar a senha master.' });
  }
};

const getUsuariosSaaS = async (req, res) => {
  try {
    const users = await db.allAsync(`
      SELECT u.id, u.nome, u.email, u.perfil as role, u.ativo, u.tenant_id as arenaId, a.nome as arenaName, u.criado_em
      FROM Usuarios u
      LEFT JOIN Arenas a ON u.tenant_id = a.id
      WHERE u.perfil != 'SuperAdmin'
      ORDER BY u.criado_em DESC
    `);
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
};

const toggleUsuarioStatus = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await db.getAsync('SELECT nome, ativo FROM Usuarios WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const newStatus = user.ativo === 1 ? 0 : 1;
    await db.runAsync('UPDATE Usuarios SET ativo = ? WHERE id = ?', [newStatus, id]);

    logAuditEvent(req.user.id, 'SaaS: Status Usuário Alterado', `Usuário ID: ${id}, Nome: ${user.nome}, Novo Status: ${newStatus === 1 ? 'Ativo' : 'Inativo'}`, req.ip);

    res.json({ message: 'Status do usuário alterado com sucesso.', ativo: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao alterar status do usuário.' });
  }
};

const resetUsuarioPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await db.getAsync('SELECT nome FROM Usuarios WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const defaultPass = 'arena123';
    const hash = await bcrypt.hash(defaultPass, 12);
    await db.runAsync('UPDATE Usuarios SET senha_hash = ? WHERE id = ?', [hash, id]);

    logAuditEvent(req.user.id, 'SaaS: Reset Senha Usuário', `Senha do Usuário ID: ${id}, Nome: ${user.nome} redefinida para padrão`, req.ip);

    res.json({ message: 'Senha do usuário redefinida com sucesso para "arena123".' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao resetar senha do usuário.' });
  }
};

const getUsuarioAcessos = async (req, res) => {
  const { id } = req.params;
  try {
    const logs = await db.allAsync(`
      SELECT evento, detalhes, ip, criado_em
      FROM LogsAuditoria
      WHERE usuario_id = ?
      ORDER BY criado_em DESC
      LIMIT 10
    `);
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar acessos do usuário.' });
  }
};

const getComunicadosSaaS = async (req, res) => {
  try {
    const query = `
      SELECT c.id, c.mensagem as message, c.destino as audience, c.canal as channel, c.criado_em as createdAt, c.expira_em as expiresAt, c.ativo,
             CASE WHEN c.destino = 'all' THEN 'Todas as arenas' ELSE a.nome END as audienceLabel
      FROM ComunicadosSaaS c
      LEFT JOIN Arenas a ON c.destino = a.id
      WHERE c.ativo = 1
      ORDER BY c.criado_em DESC
    `;
    const rows = await db.allAsync(query);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar comunicados.' });
  }
};

const createComunicadoSaaS = async (req, res) => {
  const { message, audience, channel, expiresAt } = req.body;
  if (!message || !audience || !channel) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }
  try {
    const expDate = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.runAsync(
      'INSERT INTO ComunicadosSaaS (mensagem, destino, canal, expira_em) VALUES (?, ?, ?, ?)',
      [message, audience, channel, expDate]
    );

    logAuditEvent(req.user.id, 'SaaS: Novo Comunicado', `Destino: ${audience}, Canal: ${channel}, Msg: ${message.substring(0, 50)}`, req.ip);

    // Dispara comunicados por e-mail em background se canal for 'email'
    if (channel === 'email') {
      (async () => {
        try {
          let users = [];
          if (audience === 'all') {
            users = await db.allAsync(`
              SELECT email, nome FROM Usuarios 
              WHERE perfil IN ('Administrador', 'Gerente') AND email IS NOT NULL AND email != ''
            `);
          } else {
            users = await db.allAsync(`
              SELECT email, nome FROM Usuarios 
              WHERE perfil IN ('Administrador', 'Gerente') AND tenant_id = ? AND email IS NOT NULL AND email != ''
            `, [audience]);
          }

          if (users.length > 0) {
            const { sendEmail } = require('../services/emailService');
            for (const u of users) {
              const subject = 'Comunicado Oficial - Arenix CourtManager';
              const html = `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
                  <h2 style="color: #2D3748; border-bottom: 2px solid #E2E8F0; padding-bottom: 10px;">Olá, ${u.nome}! 📢</h2>
                  <p>Você recebeu uma nova notificação oficial da administração do <strong>Arenix CourtManager</strong>:</p>
                  <div style="background-color: #F7FAFC; border-left: 4px solid #4A5568; padding: 15px; border-radius: 4px; margin: 20px 0; font-style: italic; font-size: 1.1em; color: #2D3748;">
                    "${message}"
                  </div>
                  <p style="font-size: 0.9em; color: #718096;">Por favor, acesse o seu painel de gerenciamento para acompanhar o status completo ou obter mais detalhes do sistema.</p>
                  <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 20px 0;" />
                  <p style="font-size: 0.8em; color: #A0AEC0;">Esta é uma mensagem administrativa automatizada enviada em nome da gerência de TI Arenix.</p>
                </div>
              `;
              await sendEmail(u.email, subject, html);
            }
          }
        } catch (e) {
          console.error('[SMTP] Erro ao disparar e-mails de comunicado:', e.message);
        }
      })();
    }

    res.json({ message: 'Comunicado criado com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar comunicado.' });
  }
};

const deleteComunicadoSaaS = async (req, res) => {
  const { id } = req.params;
  try {
    await db.runAsync('UPDATE ComunicadosSaaS SET ativo = 0 WHERE id = ?', [id]);
    logAuditEvent(req.user.id, 'SaaS: Remover Comunicado', `Comunicado ID: ${id} desativado`, req.ip);
    res.json({ message: 'Comunicado removido com sucesso.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover comunicado.' });
  }
};

const syncEnvFile = (keyValues) => {
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    const envPath = path.join(__dirname, '../../.env');
    if (!fs.existsSync(envPath)) return;

    let content = fs.readFileSync(envPath, 'utf8');
    for (const [key, val] of Object.entries(keyValues)) {
      if (val === undefined || val === null) continue;
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${val}`);
      } else {
        content += `\n${key}=${val}`;
      }
      process.env[key] = String(val);
    }
    fs.writeFileSync(envPath, content, 'utf8');
    console.log('[SaaS Config] Arquivo .env e process.env sincronizados com sucesso!');
  } catch (err) {
    console.error('Erro ao sincronizar .env:', err);
  }
};

const getConfiguracoesSaaS = async (req, res) => {
  try {
    const configs = await db.allAsync('SELECT chave, valor FROM ConfiguracoesSaaS');
    const reasonsRows = await db.allAsync('SELECT motivo FROM MotivosCancelamento WHERE tenant_id = 0');

    const configMap = {};
    configs.forEach(c => {
      configMap[c.chave] = c.valor;
    });

    const dbClientId = configMap['mp_client_id'] || process.env.MERCADO_PAGO_CLIENT_ID || '';
    const dbClientSecret = configMap['mp_client_secret'] || process.env.MERCADO_PAGO_CLIENT_SECRET || '';
    const dbMasterToken = configMap['mp_master_access_token'] || process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
    const dbWebhookSecret = configMap['mp_webhook_secret'] || process.env.MERCADO_PAGO_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET || '';

    res.json({
      dias_trial: configMap['dias_trial'] || '14',
      trial_ativo: configMap['trial_ativo'] !== undefined ? configMap['trial_ativo'] : '1',
      manutencao_ativa: configMap['manutencao_ativa'] || '0',
      manutencao_mensagem: configMap['manutencao_mensagem'] || '',
      mp_client_id: dbClientId,
      mp_client_secret: dbClientSecret,
      mp_master_access_token: dbMasterToken,
      mp_webhook_secret: dbWebhookSecret,
      has_mp_client_secret: Boolean(dbClientSecret),
      has_mp_master_access_token: Boolean(dbMasterToken),
      has_mp_webhook_secret: Boolean(dbWebhookSecret),
      reasons: reasonsRows.map(r => r.motivo)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar configurações.' });
  }
};

async function updateGeneralConfigs(body) {
  const { trial_ativo, dias_trial, dias_abandono_cadastro, manutencao_ativa, manutencao_mensagem } = body;

  if (trial_ativo !== undefined) {
    await db.runAsync('INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES (?, ?)', ['trial_ativo', trial_ativo === '1' || trial_ativo === true ? '1' : '0']);
  }
  if (dias_trial !== undefined) {
    const trialNum = Number.parseInt(dias_trial, 10);
    if (Number.isNaN(trialNum) || trialNum < 0) {
      throw new Error('O período de trial não pode ser um valor negativo.');
    }
    await db.runAsync('INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES (?, ?)', ['dias_trial', String(trialNum)]);
  }
  if (dias_abandono_cadastro !== undefined) {
    const diasNum = Math.max(1, Number.parseInt(dias_abandono_cadastro, 10) || 7);
    await db.runAsync('INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES (?, ?)', ['dias_abandono_cadastro', String(diasNum)]);
  }
  if (manutencao_ativa !== undefined) {
    await db.runAsync('INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES (?, ?)', ['manutencao_ativa', String(manutencao_ativa)]);
  }
  if (manutencao_mensagem !== undefined) {
    await db.runAsync('INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES (?, ?)', ['manutencao_mensagem', String(manutencao_mensagem)]);
  }
}

async function updateMercadoPagoConfigs(body) {
  const { mp_client_id, mp_client_secret, mp_master_access_token, mp_webhook_secret } = body;
  const envUpdates = {};

  if (mp_client_id !== undefined) {
    const cleanId = String(mp_client_id).trim();
    if (cleanId && !/^\d{16}$/.test(cleanId)) {
      throw new Error('O Client ID do Mercado Pago deve conter exatamente 16 dígitos numéricos.');
    }
    await db.runAsync('INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES (?, ?)', ['mp_client_id', cleanId]);
    envUpdates['MERCADO_PAGO_CLIENT_ID'] = cleanId;
  }
  if (mp_client_secret !== undefined) {
    const cleanSecret = String(mp_client_secret).trim();
    await db.runAsync('INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES (?, ?)', ['mp_client_secret', cleanSecret]);
    envUpdates['MERCADO_PAGO_CLIENT_SECRET'] = cleanSecret;
  }
  if (mp_master_access_token !== undefined) {
    const cleanToken = String(mp_master_access_token).trim();
    await db.runAsync('INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES (?, ?)', ['mp_master_access_token', cleanToken]);
    envUpdates['MERCADO_PAGO_ACCESS_TOKEN'] = cleanToken;
  }
  if (mp_webhook_secret !== undefined) {
    const cleanWebhookSecret = String(mp_webhook_secret).trim();
    await db.runAsync('INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES (?, ?)', ['mp_webhook_secret', cleanWebhookSecret]);
    envUpdates['MERCADO_PAGO_WEBHOOK_SECRET'] = cleanWebhookSecret;
  }

  if (Object.keys(envUpdates).length > 0) {
    syncEnvFile(envUpdates);
  }
}

async function updateReasonsList(reasons) {
  if (!Array.isArray(reasons)) return;
  await db.runAsync('DELETE FROM MotivosCancelamento WHERE tenant_id = 0');
  for (const r of reasons) {
    if (r.trim()) {
      await db.runAsync('INSERT INTO MotivosCancelamento (tenant_id, motivo) VALUES (0, ?)', [r.trim()]);
    }
  }
}

const updateConfiguracoesSaaS = async (req, res) => {
  try {
    await updateGeneralConfigs(req.body);
    await updateMercadoPagoConfigs(req.body);
    await updateReasonsList(req.body.reasons);

    logAuditEvent(req.user.id, 'SaaS: Configurações Atualizadas', 'Parâmetros globais do sistema e credenciais de gateway foram salvos', req.ip);
    res.json({ message: 'Configurações atualizadas com sucesso!' });
  } catch (err) {
    if (err.message && (err.message.includes('trial') || err.message.includes('Mercado Pago'))) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
};

const triggerAutoBlockCron = async (req, res) => {
  try {
    const { executarBloqueioInadimplencia } = require('../jobs/bloqueioInadimplencia');
    const result = await executarBloqueioInadimplencia();
    res.json({ message: 'Verificação de inadimplência executada com sucesso.', result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao executar verificação de inadimplência.' });
  }
};

module.exports = { 
  getArenas, getMetrics, toggleArenaStatus, getArenaById, 
  createArena, updateArena, deleteArena,
  getPlanosSaaS, updatePlanoSaaS, updateArenaPlan, getFaturasSaaS, getAllFaturasSaaS, payFaturaSaaS, getAuditoriaMaster,
  getActiveSessions, changeMasterPassword,
  getUsuariosSaaS, toggleUsuarioStatus, resetUsuarioPassword, getUsuarioAcessos,
  getComunicadosSaaS, createComunicadoSaaS, deleteComunicadoSaaS,
  getConfiguracoesSaaS, updateConfiguracoesSaaS,
  triggerAutoBlockCron, handleSaaSWebhook
};
