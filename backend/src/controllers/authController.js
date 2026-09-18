const bcrypt = require('bcrypt');
const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');

const { issueSession, logout: endSession } = require('../services/sessionService');
const { passwordError, frontendUrl, secret } = require('../utils/security');
const { createChallenge, resetWithChallenge } = require('../services/recoveryService');
const login = async (req,res) => {
  try {
    const {email,senha}=req.body;
    if(typeof email!=='string'||typeof senha!=='string'||email.length>254||senha.length>200) return res.status(400).json({error:'Credenciais invalidas.'});
    const user=await db.getAsync('SELECT u.*,a.nome AS arena_nome,a.slug AS arena_slug,a.status AS arena_status FROM Usuarios u LEFT JOIN Arenas a ON a.id=u.tenant_id WHERE LOWER(u.email)=?',[email.trim().toLowerCase()]);
    if(!user||!await bcrypt.compare(senha,user.senha_hash)) return res.status(401).json({error:'E-mail ou senha invalidos.'});
    if(user.ativo===0||user.arena_status===-1) return res.status(403).json({error:'Conta indisponivel.'});
    if(user.perfil==='SuperAdmin' && typeof req.body.recovery_code==='string') {
      await require('../config/securitySchema').ensureSecuritySchema(db);
      await db.transaction(async()=>{
        const consumed=await db.runAsync('UPDATE MfaRecovery SET used=1 WHERE usuario_id=? AND code_hash=? AND used=0',[user.id,require('../utils/security').hash(req.body.recovery_code)]);
        if(consumed.changes!==1) throw require('../utils/security').httpError(403,'Codigo de recuperacao invalido.');
        await db.runAsync('UPDATE Usuarios SET two_factor_secret=NULL WHERE id=?',[user.id]);
        await db.runAsync('DELETE FROM MfaRecovery WHERE usuario_id=?',[user.id]);
        await require('../services/sessionService').revokeUser(user.id);
      });
      user.two_factor_secret=null;
    }
    if(user.perfil==='SuperAdmin' && user.two_factor_secret && require('../utils/security').decrypt(user.two_factor_secret)!=='JBSWY3DPEHPK3PXP' && !require('../utils/totp').verify(user.two_factor_secret,req.body.codigo_2fa)) return res.status(403).json({error:'Segundo fator obrigatorio.',requires_2fa:true});
    const token=await issueSession(user,req,res);
    if(user.perfil==='Cliente'&&user.tenant_id) await require('../services/clientAccessService').membership(user,user.tenant_id,true);
    logAuditEvent(user.id,'Login', 'Sessao iniciada',req.ip);
    res.json({token,requires_mfa_setup:user.perfil==='SuperAdmin'&&(!user.two_factor_secret||require('../utils/security').decrypt(user.two_factor_secret)==='JBSWY3DPEHPK3PXP'),usuario:{id:user.id,nome:user.nome,email:user.email,perfil:user.perfil,cliente_id:user.cliente_id,tenant_id:user.tenant_id,arena_nome:user.arena_nome,arena_slug:user.arena_slug,arena_status:user.arena_status}});
  } catch(e){ res.status(e.status||500).json({error:e.status?e.message:'Erro ao iniciar sessao.'}); }
};
const logout=async(req,res)=>{ await endSession(req,res); res.json({message:'Sessao encerrada.'}); };

async function resolvePlanoId(planoReq) {
  if (!planoReq) return 1;
  const parsedId = Number.parseInt(planoReq, 10);
  if (!Number.isNaN(parsedId)) {
    const planoRow = await db.getAsync('SELECT id FROM PlanosSaaS WHERE id = ?', [parsedId]);
    if (planoRow) return planoRow.id;
  }
  if (typeof planoReq === 'string') {
    let searchName = planoReq.toLowerCase();
    if (searchName === 'starter') searchName = 'basic';
    const planoRow = await db.getAsync('SELECT id FROM PlanosSaaS WHERE LOWER(nome) = ?', [searchName]);
    if (planoRow) return planoRow.id;
  }
  return 1;
}

async function calculateTrialConfig() {
  const trialRow = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'dias_trial'");
  const trialAtivoRow = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'trial_ativo'");

  const isTrialAtivo = trialAtivoRow ? trialAtivoRow.valor === '1' : true;
  const diasTrial = Number.parseInt(trialRow?.valor || '14', 10);

  if (isTrialAtivo && diasTrial > 0) {
    const trialDate = new Date(Date.now() + diasTrial * 24 * 60 * 60 * 1000);
    const trialExpiraEm = trialDate.toISOString().split('T')[0];
    const diaVencimento = Number.parseInt(trialExpiraEm.split('-')[2], 10);
    return { trialExpiraEm, diaVencimento, arenaStatus: 1 };
  }

  return { trialExpiraEm: null, diaVencimento: new Date().getUTCDate(), arenaStatus: 0 };
}

async function generateUniqueSlug(arenaNomeFinal) {
  let cleanSlug = (arenaNomeFinal || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleanSlug) cleanSlug = `arena-${Date.now()}`;

  let finalSlug = cleanSlug;
  let counter = 1;
  while (await db.getAsync('SELECT id FROM Arenas WHERE slug = ?', [finalSlug])) {
    counter++;
    finalSlug = `${cleanSlug}-${counter}`;
  }
  return finalSlug;
}

async function handleRegisterCliente({nome,email,senha_hash,res}) {
  const result=await db.runAsync("INSERT INTO Usuarios(nome,email,senha_hash,perfil) VALUES(?,?,?,'Cliente')",[nome,email.trim().toLowerCase(),senha_hash]);
  res.status(201).json({message:'Cadastro realizado.',id:result.lastID});
}

async function handleRegisterAdministrador({ req, res, nome, email, senha_hash, perfil, arena_nome, telefone, arena_cidade, ip }) {
  const arenaNomeFinal = arena_nome || `Arena de ${nome}`;
  const planoReq = req.body.plano || req.body.plano_id;
  const planoIdFinal = await resolvePlanoId(planoReq);
  const { trialExpiraEm, diaVencimento, arenaStatus } = await calculateTrialConfig();
  const finalSlug = await generateUniqueSlug(arenaNomeFinal);

  db.run(
    'INSERT INTO Arenas (nome, slug, email, telefone, endereco, plano_id, dia_vencimento, trial_expira_em, status, ciclo_cobranca) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
    [arenaNomeFinal, finalSlug, email.trim().toLowerCase(), telefone || null, arena_cidade || null, planoIdFinal, diaVencimento, trialExpiraEm, arenaStatus, 'mensal'], 
    async function(err) {
      if (err) {
        console.error('Erro ao criar arena no register:', err);
        return res.status(500).json({ error: 'Erro ao criar arena.' });
      }
      const tenant_id = this.lastID;

      if (arenaStatus === 0) {
        try {
          const planoInfo = await db.getAsync('SELECT nome, valor_mensal FROM PlanosSaaS WHERE id = ?', [planoIdFinal]);
          const valorFatura = planoInfo ? planoInfo.valor_mensal : 0;
          const todayStr = new Date().toISOString().split('T')[0];
          const planoNome = planoInfo?.nome || 'Pro';

          await db.runAsync(`
            INSERT INTO FaturasSaaS (tenant_id, plano_id, valor, ciclo, descricao, data_vencimento, status)
            VALUES (?, ?, ?, 'mensal', ?, ?, 'Pendente')
          `, [tenant_id, planoIdFinal, valorFatura, `Assinatura Inicial Plano ${planoNome}`, todayStr]);
        } catch (fatErr) {
          console.error('Erro ao gerar fatura inicial para arena sem trial:', fatErr);
        }
      }

      db.run('INSERT INTO Usuarios (nome, email, senha_hash, perfil, tenant_id) VALUES (?, ?, ?, ?, ?)', 
        [nome, email, senha_hash, perfil, tenant_id], function(errUser) {
          if (errUser) {
            if (errUser.message.includes('UNIQUE')) return res.status(400).json({ error: 'E-mail já cadastrado.' });
            return res.status(500).json({ error: 'Erro ao criar usuário administrador.' });
          }
          logAuditEvent(this.lastID, 'Cadastro Administrador', `E-mail: ${email}, Arena: ${arenaNomeFinal}, Status: ${arenaStatus === 1 ? 'Trial' : 'Pendente'}`, ip);
          res.status(201).json({ message: 'Cadastro de arena realizado com sucesso!' });
      });
  });
}

const register = async (req, res) => {
  const { nome, email, senha, perfil, arena_nome, telefone, arena_cidade } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.ip;

  if (!nome || !email || !senha || !perfil) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  if (perfil !== 'Cliente' && perfil !== 'Administrador') {
    return res.status(400).json({ error: 'Perfil inválido para cadastro.' });
  }

  if (passwordError(senha)) return res.status(400).json({error:passwordError(senha)});
  try {
    const senha_hash = await bcrypt.hash(senha, 12);

    if (perfil === 'Cliente') {
      return handleRegisterCliente({ nome, email, senha_hash, perfil, ip, res });
    }
    return handleRegisterAdministrador({ req, res, nome, email, senha_hash, perfil, arena_nome, telefone, arena_cidade, ip });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno durante o cadastro.' });
  }
};

const forgotPassword=async(req,res)=>{
  try {
    const email=typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'';
    if(!email||email.length>254) return res.status(400).json({error:'E-mail invalido.'});
    const user=await db.getAsync('SELECT id,email FROM Usuarios WHERE LOWER(email)=?',[email]);
    if(user){
      const code=await createChallenge(user.id,'password');
      const link=frontendUrl()+'/redefinir-senha?token='+encodeURIComponent(user.id+'.'+code);
      await require('../services/emailService').sendEmail(user.email,'Recuperacao de senha','Acesse para redefinir sua senha: '+link);
    }
    res.json({message:'Se o e-mail estiver cadastrado, enviamos as instrucoes de recuperacao.'});
  }catch(e){res.status(e.status||500).json({error:'Nao foi possivel processar a recuperacao.'});}
};
const resetPassword=async(req,res)=>{
  try{
    const match=/^(\d+)\.([A-Za-z0-9_-]{43})$/.exec(req.body.token||'');
    if(!match) return res.status(400).json({error:'Token invalido ou expirado.'});
    const user=await db.getAsync('SELECT perfil,two_factor_secret FROM Usuarios WHERE id=?',[match[1]]);
    if(user?.perfil==='SuperAdmin'&&user.two_factor_secret&&!require('../utils/totp').verify(user.two_factor_secret,req.body.codigo_2fa)) return res.status(403).json({error:'Segundo fator obrigatorio.'});
    await resetWithChallenge(Number(match[1]),'password',match[2],req.body.novaSenha);
    res.json({message:'Senha redefinida. Faca login novamente.'});
  }catch(e){res.status(e.status||500).json({error:e.status?e.message:'Erro ao redefinir senha.'});}
};

module.exports = { login, logout, register, forgotPassword, resetPassword };
