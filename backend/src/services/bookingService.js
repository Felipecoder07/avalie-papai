const db=require('../config/database');
const {httpError,cents}=require('../utils/security');
const {getTodayString,getLocalTimeString}=require('../utils/dateUtils');
async function validateSlot(tenantId,item) {
  if(!Number.isSafeInteger(Number(item.quadra_id)) || !/^\d{4}-\d{2}-\d{2}$/.test(item.data_reserva||'') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.hora_inicio||'') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.hora_fim||'')) throw httpError(400,'Quadra, data ou horário inválido.');
  const parsed=new Date(item.data_reserva+'T00:00:00Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==item.data_reserva||item.hora_inicio>=item.hora_fim) throw httpError(400,'Intervalo inválido.');
  const today=getTodayString();
  if(item.data_reserva<today || (item.data_reserva===today&&item.hora_inicio<=getLocalTimeString())) throw httpError(400,'Horário já encerrado.');
  const court=await db.getAsync('SELECT * FROM Quadras WHERE id=? AND tenant_id=? AND status=?',[item.quadra_id,tenantId,'Ativa']);
  if(!court) throw httpError(404,'Quadra indisponível.');
  if(item.hora_inicio<(court.hora_abertura||'07:00')||item.hora_fim>(court.hora_fechamento||'22:00')) throw httpError(400,'Horário fora do funcionamento.');
  if(await db.getAsync("SELECT id FROM Reservas WHERE quadra_id=? AND data_reserva=? AND status!='Cancelada' AND hora_inicio<? AND hora_fim>?",[item.quadra_id,item.data_reserva,item.hora_fim,item.hora_inicio])) throw httpError(409,'Horário já reservado.');
  if(await db.getAsync('SELECT id FROM Bloqueios WHERE quadra_id=? AND data_bloqueio=? AND hora_inicio<? AND hora_fim>?',[item.quadra_id,item.data_reserva,item.hora_fim,item.hora_inicio])) throw httpError(409,'Horário bloqueado.');
  return court;
}
async function validateBatch(tenantId,items) {
  if(!Array.isArray(items)||!items.length||items.length>24) throw httpError(400,'Selecione de 1 a 24 horários.');
  for(let i=0;i<items.length;i++) {
    await validateSlot(tenantId,items[i]);
    for(let j=0;j<i;j++) if(Number(items[i].quadra_id)===Number(items[j].quadra_id)&&items[i].data_reserva===items[j].data_reserva&&items[i].hora_inicio<items[j].hora_fim&&items[i].hora_fim>items[j].hora_inicio) throw httpError(409,'Horários duplicados no pedido.');
  }
}
module.exports={validateSlot,validateBatch};
