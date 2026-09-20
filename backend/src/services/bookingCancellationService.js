const db=require('../config/database');
const {ensureSecuritySchema}=require('../config/securitySchema');
const {httpError}=require('../utils/security');
async function hasInFlight(reservation) {
  const scope=reservation.grupo_id || 'reservation:'+reservation.id;
  if(await db.getAsync("SELECT 1 FROM PaymentIntents WHERE tenant_id=? AND scope=? AND state IN ('creating','pending','unknown')",[reservation.tenant_id,scope])) return true;
  return Boolean(await db.getAsync("SELECT 1 FROM TransacoesGateway t JOIN Reservas r ON r.id=t.reserva_id WHERE r.tenant_id=? AND (r.id=? OR (? IS NOT NULL AND r.grupo_id=?)) AND t.status NOT IN ('Pago','Aprovado','Estornado','Chargeback','Cancelado','Rejeitado','Expirado')",[reservation.tenant_id,reservation.id,reservation.grupo_id,reservation.grupo_id]));
}
async function requestCancellation(ids,{tenantId,authorize,reason='Cancelamento',onlyUnpaid=false}={}) {
  await ensureSecuritySchema(db);
  if(!Array.isArray(ids)||!ids.length||ids.length>24||ids.some(id=>!Number.isSafeInteger(Number(id))||Number(id)<=0)) throw httpError(400,'Reservas inválidas.');
  return db.transaction(async()=>{
    const rows=new Map();
    for(const id of ids) {
      const row=await db.getAsync('SELECT * FROM Reservas WHERE id=? AND tenant_id=?',[id,tenantId]);
      if(!row || (authorize && !await authorize(row))) throw httpError(404,'Reserva não encontrada.');
      for(const member of await require('./paymentLedgerService').scopeReservations(row)) {
        if(authorize && !await authorize(member)) throw httpError(404,'Reserva não encontrada.');
        rows.set(member.id,member);
      }
    }
    for(const row of rows.values()) {
      const paid=await db.getAsync('SELECT COALESCE(SUM(valor),0) AS total FROM Pagamentos WHERE reserva_id=?',[row.id]);
      if(onlyUnpaid && (paid.total>0 || !['Pendente','Cancelamento pendente','Cancelada'].includes(row.status))) throw httpError(409,'Reserva paga ou confirmada. Use o cancelamento da sua conta.');
    }
    const results=[];
    for(const row of rows.values()) {
      await db.runAsync('INSERT OR IGNORE INTO BookingCancellations(reserva_id,reason,created) VALUES(?,?,?)',[row.id,reason,Date.now()]);
      await require('./paymentLedgerService').recompute(row.id);
      const updated=await db.getAsync('SELECT id,status,status_pagamento FROM Reservas WHERE id=?',[row.id]);
      results.push(updated);
      if(updated.status==='Cancelamento pendente') await db.runAsync('INSERT OR IGNORE INTO SecurityOutbox(id,kind,payload,created) VALUES(?,?,?,?)',['cancel:'+row.id,'booking_cancellation_review',JSON.stringify({reserva_id:row.id,tenant_id:row.tenant_id}),Date.now()]);
    }
    return {pending:results.some(row=>row.status==='Cancelamento pendente'),reservas:results};
  });
}
async function expireUnpaid(tenantId) {
  await ensureSecuritySchema(db);
  const rows=await db.allAsync("SELECT id FROM Reservas WHERE tenant_id=? AND criado_por IS NULL AND status='Pendente' AND status_pagamento='Pendente' AND datetime(criado_em,'+15 minutes')<datetime('now')",[tenantId]);
  for(const row of rows) {
    try { await requestCancellation([row.id],{tenantId,onlyUnpaid:true,reason:'Expiração do checkout'}); }
    catch(error) { if(error.status!==409) throw error; }
  }
}
module.exports={hasInFlight,requestCancellation,expireUnpaid};
