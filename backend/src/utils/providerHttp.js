const {httpError}=require('./security');
let active=0;
async function fetchProvider(url,options={}) {
  const target=new URL(url);
  if(target.protocol!=='https:'||target.hostname!=='api.mercadopago.com') throw httpError(400,'Destino de integração inválido.');
  if(active>=20) throw httpError(503,'Integração ocupada. Tente novamente.');
  active++;
  try { return await globalThis.fetch(url,{...options,signal:AbortSignal.timeout(15000)}); }
  finally { active--; }
}
module.exports={fetch:fetchProvider};
