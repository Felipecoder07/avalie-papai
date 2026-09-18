const db=require('../config/database');
const bcrypt=require('bcrypt');
const {encrypt,decrypt,hash,httpError,secret}=require('../utils/security');
const {generate,verify}=require('../utils/totp');
const {issueSession,revokeUser}=require('../services/sessionService');
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res,next)}catch(e){res.status(e.status||500).json({error:e.status?e.message:'Falha ao verificar segundo fator.'})}};
const requireMasterMfa=wrap(async(req,res,next)=>{
 const proof=await db.getAsync('SELECT verified_at FROM SessionMfa WHERE token_hash=?',[req.authSession.token_hash]);
 if(!proof) throw httpError(403,'Configure e confirme seu segundo fator no login master.');
 next();
});
const setup=wrap(async(req,res)=>{
 if(req.user.perfil!=='SuperAdmin') throw httpError(403,'Perfil nao autorizado.');
 const user=await db.getAsync('SELECT * FROM Usuarios WHERE id=?',[req.user.id]);
 if(typeof req.body.senha!=='string'||!await bcrypt.compare(req.body.senha,user.senha_hash)) throw httpError(403,'Senha atual obrigatoria.');
 if(user.two_factor_secret && decrypt(user.two_factor_secret)!=='JBSWY3DPEHPK3PXP') throw httpError(409,'Segundo fator ja configurado.');
 const key=generate();
 await db.runAsync('INSERT OR REPLACE INTO MfaEnrollment(usuario_id,secret,expires) VALUES(?,?,?)',[user.id,encrypt(key),Date.now()+600000]);
 const uri='otpauth://totp/Arenix:'+encodeURIComponent(user.email)+'?secret='+key+'&issuer=Arenix';
 res.set('Cache-Control','no-store').json({qr_code:await require('qrcode').toDataURL(uri)});
});
const confirm=wrap(async(req,res)=>{
 if(req.user.perfil!=='SuperAdmin') throw httpError(403,'Perfil nao autorizado.');
 const codes=Array.from({length:8},()=>secret().slice(0,16));
 await db.transaction(async()=>{
  const entry=await db.getAsync('SELECT * FROM MfaEnrollment WHERE usuario_id=? AND expires>?',[req.user.id,Date.now()]);
  if(!entry||!verify(entry.secret,req.body.codigo_2fa)) throw httpError(400,'Codigo invalido ou cadastro expirado.');
  await db.runAsync('UPDATE Usuarios SET two_factor_secret=? WHERE id=?',[entry.secret,req.user.id]);
  await db.runAsync('DELETE FROM MfaEnrollment WHERE usuario_id=?',[req.user.id]);
  await db.runAsync('DELETE FROM MfaRecovery WHERE usuario_id=?',[req.user.id]);
  for(const code of codes) await db.runAsync('INSERT INTO MfaRecovery(usuario_id,code_hash) VALUES(?,?)',[req.user.id,hash(code)]);
  await revokeUser(req.user.id);
 });
 const token=await issueSession(req.user,req,res);
 res.set('Cache-Control','no-store').json({token,recovery_codes:codes});
});
module.exports={requireMasterMfa,setup,confirm};
