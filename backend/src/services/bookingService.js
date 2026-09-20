const db=require('../config/database');
const {httpError,cents}=require('../utils/security');
const {getTodayString,getLocalTimeString}=require('../utils/dateUtils');
const { quoteSlot } = require('../utils/bookingPrice');
const { ensureSecuritySchema } = require('../config/securitySchema');
async function validateSlot(tenantId,item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw httpError(400,'Horário inválido.');
  if(!Number.isSafeInteger(Number(item.quadra_id)) || !/^\d{4}-\d{2}-\d{2}$/.test(item.data_reserva||'') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.hora_inicio||'') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.hora_fim||'')) throw httpError(400,'Quadra, data ou horário inválido.');
  const parsed=new Date(item.data_reserva+'T00:00:00Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==item.data_reserva||item.hora_inicio>=item.hora_fim) throw httpError(400,'Intervalo inválido.');
  const arena = await db.getAsync('SELECT fuso_horario FROM Arenas WHERE id=? AND status=1',[tenantId]);
  if (!arena) throw httpError(404,'Arena indisponível.');
  const zone=arena.fuso_horario || 'America/Sao_Paulo';
  const today=getTodayString(zone);
  if(item.data_reserva<today || (item.data_reserva===today&&item.hora_inicio<=getLocalTimeString(zone))) throw httpError(400,'Horário já encerrou.');
  const court=await db.getAsync('SELECT * FROM Quadras WHERE id=? AND tenant_id=? AND status=?',[item.quadra_id,tenantId,'Ativa']);
  if(!court) throw httpError(404,'Quadra indisponível.');
  if(item.hora_inicio<(court.hora_abertura||'07:00')||item.hora_fim>(court.hora_fechamento||'22:00')) throw httpError(400,'Horário fora do funcionamento.');
  if(await db.getAsync("SELECT id FROM Reservas WHERE quadra_id=? AND data_reserva=? AND status!='Cancelada' AND hora_inicio<? AND hora_fim>?",[item.quadra_id,item.data_reserva,item.hora_fim,item.hora_inicio])) throw httpError(409,'Horário já reservado.');
  if(await db.getAsync('SELECT id FROM Bloqueios WHERE quadra_id=? AND data_bloqueio=? AND hora_inicio<? AND hora_fim>?',[item.quadra_id,item.data_reserva,item.hora_fim,item.hora_inicio])) throw httpError(409,'Horário bloqueado.');
  return court;
}
async function validateBatch(tenantId,items) {
  if(!Array.isArray(items)||!items.length||items.length>24) throw httpError(400,'Selecione de 1 a 24 horários.');
  const validated=[];
  for(let i=0;i<items.length;i++) {
    const court=await validateSlot(tenantId,items[i]);
    validated.push({item:items[i],quote:quoteSlot(court,items[i])});
    for(let j=0;j<i;j++) if(Number(items[i].quadra_id)===Number(items[j].quadra_id)&&items[i].data_reserva===items[j].data_reserva&&items[i].hora_inicio<items[j].hora_fim&&items[i].hora_fim>items[j].hora_inicio) throw httpError(409,'Horários duplicados no pedido.');
  }
  return validated;
}
function checkoutContact(contact) {
  if (!contact || typeof contact.nome !== 'string' || !contact.nome.trim() || contact.nome.length>150 || typeof contact.telefone !== 'string' || !contact.telefone.trim() || contact.telefone.length>30) throw httpError(400,'Nome e telefone válidos são obrigatórios.');
  for (const [field,max] of [['email',254],['cpf',30]]) if (contact[field] != null && (typeof contact[field] !== 'string' || contact[field].length>max)) throw httpError(400,'Contato inválido.');
  return {nome:contact.nome.trim(),telefone:contact.telefone.trim(),email:contact.email?.trim()||null,cpf:contact.cpf?.trim()||null};
}
async function createBookings({tenantId,items,actor,contact,source='public'}) {
  await ensureSecuritySchema(db);
  const snapshot = source==='public' ? checkoutContact(contact) : null;
  return db.transaction(async()=>{
    const validated=await validateBatch(tenantId,items);
    let clientId;
    if(source==='staff') {
      if(!require('../utils/permissions').can(actor,'reservations.manage') || Number(actor.tenant_id)!==Number(tenantId)) throw httpError(403,'Acesso negado.');
      const client=await db.getAsync('SELECT id FROM Clientes WHERE id=? AND tenant_id=? AND ativo=1',[items[0].cliente_id,tenantId]);
      if(!client || items.some(item=>Number(item.cliente_id)!==Number(client.id))) throw httpError(404,'Cliente não pertence a esta arena.');
      clientId=client.id;
    } else if(actor) {
      if(actor.perfil!=='Cliente') throw httpError(403,'Use o painel para reservas da equipe.');
      clientId=(await require('./clientAccessService').membership(actor,tenantId,true)).id;
    } else {
      // A non-reusable FK record; checkout PII lives only in its booking snapshot.
      clientId=(await db.runAsync("INSERT INTO Clientes(tenant_id,nome,ativo) VALUES(?,'Visitante',0)",[tenantId])).lastID;
    }
    const group=require('../utils/security').secret(), ids=[];
    if(snapshot) await db.runAsync('INSERT INTO BookingContacts(grupo_id,tenant_id,nome,telefone,email,cpf) VALUES(?,?,?,?,?,?)',[group,tenantId,snapshot.nome,snapshot.telefone,snapshot.email,snapshot.cpf]);
    let total=0;
    for(const {item,quote} of validated) {
      let amount=quote.amount;
      if(source==='staff' && item.valor_total!==undefined && cents(item.valor_total,{zero:true})!==amount) {
        const requested=cents(item.valor_total,{zero:true}),reason=item.justificativa_desconto;
        if(!require('../utils/permissions').can(actor,'payments.discount') || typeof reason!=='string' || reason.trim().length<5 || reason.length>500 || requested>amount || (actor.perfil==='Gerente' && requested<Math.ceil(amount*0.7))) throw httpError(403,'Desconto exige permissão, limite e justificativa.');
        amount=requested;
        await db.runAsync('INSERT INTO LogsAuditoria(tenant_id,usuario_id,evento,detalhes) VALUES(?,?,?,?)',[tenantId,actor.id,'Desconto na reserva',JSON.stringify({original_centavos:quote.amount,final_centavos:amount,justificativa:reason.trim()})]);
      }
      const inserted=await db.runAsync('INSERT INTO Reservas(tenant_id,cliente_id,quadra_id,data_reserva,hora_inicio,hora_fim,valor_total,status,status_pagamento,criado_por,grupo_id,esporte) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[tenantId,clientId,item.quadra_id,item.data_reserva,item.hora_inicio,item.hora_fim,amount,source==='staff'?'Confirmada':'Pendente','Pendente',source==='staff'?actor.id:null,group,quote.sport]);
      ids.push(inserted.lastID);total+=amount;
      if(source==='staff' && item.pagamento?.registrar) {
        const paid=item.pagamento.valor===undefined?amount:cents(item.pagamento.valor);
        if(paid>amount) throw httpError(400,'Pagamento acima do saldo.');
        const method=require('./manualPaymentService').manualMethod(item.pagamento.metodo);
        await db.runAsync('INSERT INTO Pagamentos(reserva_id,valor,metodo,registrado_por) VALUES(?,?,?,?)',[inserted.lastID,paid,method,actor.id]);
      }
      await require('./paymentLedgerService').recompute(inserted.lastID);
    }
    return {reservasCriadasIds:ids,valorTotalGeral:total,grupoId:group};
  });
}
module.exports={validateSlot,validateBatch,createBookings};
