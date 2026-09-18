const crypto=require('node:crypto');
const {decrypt,production}=require('./security');
async function validateWebhook(req) {
  const db=require('../config/database');
  const row=await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave='mp_webhook_secret'");
  const secret=decrypt(row?.valor)||process.env.MERCADO_PAGO_WEBHOOK_SECRET||process.env.MP_WEBHOOK_SECRET;
  if(!secret) return !production() && process.env.NODE_ENV==='test';
  const parts=Object.fromEntries(String(req.headers['x-signature']||'').split(',').map(p=>p.trim().split('=')));
  const id=String(req.query['data.id']||req.body?.data?.id||req.query.id||req.body?.id||'').toLowerCase();
  const requestId=req.headers['x-request-id'];
  if(!id||!requestId||!/^\d+$/.test(parts.ts||'')||!/^[a-f0-9]{64}$/i.test(parts.v1||'')) return false;
  if(req.query['data.id'] && req.body?.data?.id && String(req.query['data.id'])!==String(req.body.data.id)) return false;
  const stamp=Number(parts.ts),millis=stamp>1e12?stamp:stamp*1000;
  if(Math.abs(Date.now()-millis)>900000) return false;
  const expected=crypto.createHmac('sha256',secret).update(`id:${id};request-id:${requestId};ts:${parts.ts};`).digest();
  return crypto.timingSafeEqual(expected,Buffer.from(parts.v1,'hex'));
}
module.exports={validateWebhook};
