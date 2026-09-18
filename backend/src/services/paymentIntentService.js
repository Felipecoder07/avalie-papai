const db=require('../config/database');
const {ensureSecuritySchema}=require('../config/securitySchema');
const {cents,httpError,secret}=require('../utils/security');
async function withIntent(method,reservationId,value,tenantId,create) {
  await ensureSecuritySchema(db);
  const amount=cents(value);
  const selected=await db.transaction(async()=>{
    const reservation=await db.getAsync('SELECT * FROM Reservas WHERE id=? AND tenant_id=?',[reservationId,tenantId]);
    if(!reservation||reservation.status==='Cancelada') throw httpError(400,'Reserva indisponível para pagamento.');
    const scope=reservation.grupo_id||'reservation:'+reservation.id;
    const existing=await db.getAsync("SELECT * FROM PaymentIntents WHERE tenant_id=? AND scope=? AND method=? AND state IN ('creating','pending','unknown')",[tenantId,scope,method]);
    if(existing) {
      if(existing.amount_cents!==amount) throw httpError(409,'Já existe uma cobrança em andamento para este pedido.');
      if(existing.response_json) return {cached:JSON.parse(existing.response_json)};
      if(existing.state==='creating'&&Date.now()-existing.updated<30000) throw httpError(409,'Cobrança sendo processada. Consulte novamente.');
      await db.runAsync("UPDATE PaymentIntents SET state='creating',updated=? WHERE id=?",[Date.now(),existing.id]);
      return {id:existing.id};
    }
    const rows=await require('./paymentLedgerService').scopeReservations(reservation);
    let balance=0;
    for(const r of rows) {
      if(r.status==='Cancelada') throw httpError(409,'Pedido contém reserva cancelada.');
      const paid=await db.getAsync('SELECT COALESCE(SUM(valor),0) AS total FROM Pagamentos WHERE reserva_id=?',[r.id]);
      balance+=Math.max(0,cents(r.valor_total,{zero:true})-Math.round(paid.total*100));
    }
    if(amount>balance) throw httpError(400,'Valor acima do saldo do pedido.');
    const id=secret();
    await db.runAsync('INSERT INTO PaymentIntents(id,tenant_id,reserva_id,scope,method,amount_cents,created,updated) VALUES(?,?,?,?,?,?,?,?)',[id,tenantId,reservationId,scope,method,amount,Date.now(),Date.now()]);
    return {id};
  });
  if(selected.cached) return selected.cached;
  try {
    const response=await create(selected.id);
    await db.runAsync("UPDATE PaymentIntents SET state=CASE WHEN state='paid' OR EXISTS(SELECT 1 FROM TransacoesGateway t WHERE t.gateway_ref=? AND t.status='Pago') THEN 'paid' ELSE 'pending' END,gateway_ref=?,response_json=?,updated=? WHERE id=?",[response.gateway_ref,response.gateway_ref,JSON.stringify(response),Date.now(),selected.id]);
    return response;
  } catch(error) {
    await db.runAsync("UPDATE PaymentIntents SET state='unknown',updated=? WHERE id=?",[Date.now(),selected.id]);
    throw error;
  }
}
module.exports={withIntent};
