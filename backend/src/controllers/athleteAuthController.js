const db = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { issueSession } = require('../services/sessionService');
const { membership } = require('../services/clientAccessService');
const { createChallenge, resetWithChallenge } = require('../services/recoveryService');
const { passwordError, httpError, secret } = require('../utils/security');
const { ensureSecuritySchema } = require('../config/securitySchema');
const safe = handler => async (req,res) => {
  try { await handler(req,res); } catch (e) { res.status(e.status || 500).json({ error: require('../utils/security').publicError(e, 'Não foi possível concluir a operação.') }); }
};
async function arenaFor(req) {
  const arena = await db.getAsync('SELECT id,nome FROM Arenas WHERE slug=? AND status=1', [req.params.slug]);
  if (!arena) throw httpError(404,'Arena não encontrada.');
  return arena;
}
function emailOf(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw httpError(400,'E-mail inválido.');
  return value.trim().toLowerCase();
}
async function finishLogin(user, arena, req, res, status=200) {
  if (user.perfil !== 'Cliente' || user.ativo === 0) throw httpError(403,'Use o portal correspondente à sua conta.');
  const client = await membership(user,arena.id,true);
  await issueSession(user,req,res);
  res.status(status).json({ usuario:{ id:user.id,nome:user.nome,email:user.email,telefone:client.telefone || '',avatar_url:client.avatar_url || '' } });
}
const loginAtletaPublico = safe(async (req,res) => {
  const arena = await arenaFor(req), email = emailOf(req.body.email);
  const user = await db.getAsync('SELECT id, nome, email, senha_hash, perfil, ativo, two_factor_secret FROM Usuarios WHERE LOWER(email)=?', [email]);
  if (typeof req.body.senha !== 'string' || Buffer.byteLength(req.body.senha,'utf8')>72 || !user || !await bcrypt.compare(req.body.senha,user.senha_hash)) throw httpError(401,'E-mail ou senha incorretos.');
  await finishLogin(user,arena,req,res);
});
const cadastrarAtletaPublico = safe(async (req,res) => {
  const arena = await arenaFor(req), email=emailOf(req.body.email), {nome,senha}=req.body;
  if (typeof nome !== 'string' || !nome.trim() || nome.length>150 || passwordError(senha)) throw httpError(400,passwordError(senha)||'Nome inválido.');
  let user = await db.getAsync('SELECT id, nome, email, senha_hash, perfil, ativo, two_factor_secret FROM Usuarios WHERE LOWER(email)=?', [email]);
  if (user) {
    if (!await bcrypt.compare(senha,user.senha_hash)) throw httpError(400,'Não foi possível cadastrar. Faça login ou recupere o acesso.');
    return finishLogin(user,arena,req,res);
  }
  const result=await db.runAsync("INSERT INTO Usuarios(nome,email,senha_hash,perfil,ativo) VALUES(?,?,?,'Cliente',1)",[nome.trim(),email,await bcrypt.hash(senha,12)]);
  user=await db.getAsync('SELECT id, nome, email, perfil, ativo FROM Usuarios WHERE id=?',[result.lastID]);
  await finishLogin(user,arena,req,res,201);
});
const googleAuthAtletaPublico = safe(async (req,res) => {
  const arena=await arenaFor(req);
  if (typeof req.body.credential !== 'string' || req.body.credential.length>8192) throw httpError(400,'Credencial Google obrigatória.');
  if (!process.env.GOOGLE_CLIENT_ID) throw httpError(503,'Login Google não configurado. Use e-mail e senha.');
  const { OAuth2Client } = require('google-auth-library');
  let payload;
  try { payload=(await new OAuth2Client().verifyIdToken({idToken:req.body.credential,audience:process.env.GOOGLE_CLIENT_ID})).getPayload(); }
  catch { throw httpError(401,'Identidade Google inválida.'); }
  if (!payload?.sub || payload.email_verified!==true || typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now()/1000)) throw httpError(401,'E-mail Google não verificado.');
  const email=emailOf(payload.email);
  await ensureSecuritySchema(db);
  const identity=await db.getAsync("SELECT usuario_id FROM ExternalIdentities WHERE provider='google' AND subject=?",[payload.sub]);
  let user=identity ? await db.getAsync('SELECT id, nome, email, perfil, ativo FROM Usuarios WHERE id=?',[identity.usuario_id]) : null;
  if (!identity) {
    user=await db.getAsync('SELECT id, nome, email, senha_hash, perfil, ativo, two_factor_secret FROM Usuarios WHERE LOWER(email)=?',[email]);
    if (user && (typeof req.body.senha !== 'string' || Buffer.byteLength(req.body.senha,'utf8')>72 || !await bcrypt.compare(req.body.senha,user.senha_hash))) throw httpError(409,'Entre com sua senha para vincular esta conta Google.');
    if (user && user.perfil!=='Cliente') throw httpError(403,'Use o portal administrativo.');
    if (!user) {
      const inserted=await db.runAsync("INSERT INTO Usuarios(nome,email,senha_hash,perfil,ativo) VALUES(?,?,?,'Cliente',1)",[String(payload.name||email).slice(0,150),email,await bcrypt.hash(secret(),12)]);
      user=await db.getAsync('SELECT id, nome, email, perfil, ativo FROM Usuarios WHERE id=?',[inserted.lastID]);
    }
    await db.runAsync("INSERT INTO ExternalIdentities(provider,subject,usuario_id) VALUES('google',?,?)",[payload.sub,user.id]);
  }
  await finishLogin(user,arena,req,res);
});
const getPerfilAtleta = safe(async (req,res) => {
  const arena=await arenaFor(req), client=await membership(req.user,arena.id,true);
  res.json({perfil:{id:req.user.id,nome:client.nome,email:req.user.email,telefone:client.telefone||'',cpf:client.cpf||'',avatar_url:client.avatar_url||''}});
});
const atualizarPerfilAtleta = safe(async (req,res) => {
  if (req.user.perfil !== 'Cliente') throw httpError(403, 'Operação exclusiva de atleta.');
  const arena=await arenaFor(req), client=await membership(req.user,arena.id,true);
  const {nome,telefone,cpf,nova_senha,avatar_url}=req.body;

  if (nome!==undefined && (typeof nome!=='string'||!nome.trim()||nome.length>150)) throw httpError(400,'Nome inválido.');
  for (const field of [telefone,cpf]) if (field!==undefined && (typeof field!=='string'||field.length>30)) throw httpError(400,'Contato inválido.');
  if (avatar_url && !/^\/uploads\/[a-zA-Z0-9_.-]+\.(png|jpg|webp)$/.test(avatar_url)) throw httpError(400,'Imagem inválida.');
  if (nova_senha !== undefined) {
    await require('../services/passwordService').changeOwnPassword(req.user, req.body);
    await issueSession(req.user, req, res);
  }
  await db.runAsync('UPDATE Clientes SET nome=COALESCE(?,nome),telefone=COALESCE(?,telefone),cpf=COALESCE(?,cpf),avatar_url=COALESCE(?,avatar_url) WHERE id=? AND tenant_id=?',[nome?.trim(),telefone,cpf,avatar_url,client.id,arena.id]);
  res.json({message:'Perfil atualizado.',usuario:{id:req.user.id,nome:nome||client.nome,email:req.user.email,telefone:telefone??client.telefone,cpf:cpf??client.cpf,avatar_url:avatar_url??client.avatar_url}});
});
const solicitarRecuperacaoSenhaAtleta = safe(async (req,res) => {
  await arenaFor(req);
  const user=await db.getAsync("SELECT id,email FROM Usuarios WHERE LOWER(email)=? AND perfil='Cliente'",[emailOf(req.body.email)]);
  if (user) {
    const code=crypto.randomInt(100000,1000000).toString();
    await createChallenge(user.id,'athlete-password',code,900000);
    void require('../services/emailService').sendEmail(user.email,'Recuperação de acesso',`Seu código de recuperação é ${code}. Válido por 15 minutos.`).catch(() => require('../utils/safeLogger').forModule('athleteAuth').error('Falha de entrega de recuperação.'));
  }
  res.json({message:'Se o e-mail estiver cadastrado, enviamos as instruções de recuperação.'});
});
const redefinirSenhaAtleta = safe(async (req,res) => {
  await arenaFor(req);
  const user=await db.getAsync("SELECT id FROM Usuarios WHERE LOWER(email)=? AND perfil='Cliente'",[emailOf(req.body.email)]);
  await resetWithChallenge(user?.id ?? -1,'athlete-password',String(req.body.codigo||''),req.body.nova_senha);
  res.json({message:'Senha redefinida. Faça login novamente.'});
});
module.exports={loginAtletaPublico,cadastrarAtletaPublico,googleAuthAtletaPublico,getPerfilAtleta,atualizarPerfilAtleta,solicitarRecuperacaoSenhaAtleta,redefinirSenhaAtleta};
