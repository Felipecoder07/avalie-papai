const db=require('../config/database');
const {ensureSecuritySchema}=require('../config/securitySchema');
const {cents,httpError}=require('../utils/security');
async function recompute(reservationId) {
  const row=await db.getAsync('SELECT r.*,COALESCE((SELECT SUM(p.valor) FROM Pagamentos p WHERE p.reserva_id=r.id),0) AS paid FROM Reservas r WHERE id=?',[reservationId]);
  if(!row) throw httpError(404,'Reserva não encontrada.');
  const paid=row.paid,total=row.valor_total;
  let state=paid>=total?'Pago':paid>0?'Parcial':'Pendente';
  const cancelled=row.status==='Cancelada'||Boolean(await db.getAsync('SELECT 1 FROM BookingCancellations WHERE reserva_id=?',[row.id]));
  const held=cancelled && (paid>0 || await require('./bookingCancellationService').hasInFlight(row));
  if(cancelled) state=paid>0?'Cancelado (Pendente Estorno)':held?'Conciliação pendente':'Cancelado';
  const bookingState=cancelled?(held?'Cancelamento pendente':'Cancelada'):paid>=total?'Confirmada':row.status;
  await db.runAsync('UPDATE Reservas SET status_pagamento=?,status=? WHERE id=?',[state,bookingState,row.id]);
  return {totalPago:paid,saldoDevedor:Math.max(0,total-paid),novoStatus:state};
}
async function scopeReservations(reserva) {
  const rows = reserva.grupo_id
    ? db.allAsync('SELECT * FROM Reservas WHERE grupo_id=? AND tenant_id=? ORDER BY id',[reserva.grupo_id,reserva.tenant_id])
    : [reserva];
  const members=await rows;
  if(members.some(row=>Number(row.cliente_id)!==Number(reserva.cliente_id))) throw httpError(409,'Grupo inconsistente. Solicite revisão da arena.');
  return members;
}
async function settle(gatewayRef,payload={}) {
  await ensureSecuritySchema(db);
  return db.transaction(async()=>{
    const tx=await db.getAsync('SELECT * FROM TransacoesGateway WHERE gateway_ref=?',[gatewayRef]);
    if(!tx) throw httpError(404,'Transação não encontrada.');
    if(['Pago','Estornado','Chargeback'].includes(tx.status)) return {status:'already_paid',reserva_id:tx.reserva_id};
    const amount=Number(tx.valor);
    if(payload.valor_pago!==undefined && Number(payload.valor_pago)!==amount) { console.log('amount:', amount, 'payload.valor_pago:', payload.valor_pago); throw httpError(400,'Valor confirmado divergente da cobrança.'); }
    const reserva=await db.getAsync('SELECT * FROM Reservas WHERE id=?',[tx.reserva_id]);
    if(!reserva) throw httpError(404,'Reserva não encontrada.');
    if(payload.device_id!==undefined) {
      const arena=await db.getAsync('SELECT gateway_device_id FROM Arenas WHERE id=?',[reserva.tenant_id]);
      if(arena.gateway_device_id!==payload.device_id) throw httpError(400,'Terminal inválido para a arena.');
    }
    const credit=await db.runAsync('INSERT OR IGNORE INTO GatewayCredits(gateway_ref,amount_cents,created) VALUES(?,?,?)',[gatewayRef,amount,Date.now()]);
    if(!credit.changes) return {status:'already_paid',reserva_id:tx.reserva_id};
    const reservations=await scopeReservations(reserva);
    await db.runAsync("UPDATE TransacoesGateway SET status='Pago',atualizado_em=CURRENT_TIMESTAMP WHERE id=?",[tx.id]);
    await db.runAsync("UPDATE PaymentIntents SET state='paid',updated=? WHERE gateway_ref=?",[Date.now(),gatewayRef]);
    let left=amount;
    for(const r of reservations) {
      if(r.status==='Cancelada') await db.runAsync('INSERT OR IGNORE INTO BookingCancellations(reserva_id,reason,created) VALUES(?,?,?)',[r.id,'Pagamento após cancelamento',Date.now()]);
      const paid=await db.getAsync('SELECT COALESCE(SUM(valor),0) AS total FROM Pagamentos WHERE reserva_id=?',[r.id]);
      const allocation=Math.min(left,Math.max(0,r.valor_total-paid.total));
      if(allocation>0) {
        await db.runAsync('INSERT INTO PaymentAllocations(gateway_ref,reserva_id,amount_cents) VALUES(?,?,?)',[gatewayRef,r.id,allocation]);
        const method=tx.metodo==='Cartao'?'Cartão de Crédito Online':tx.metodo==='Maquineta'?'Cartão (Maquineta)':'Pix Online';
        await db.runAsync('INSERT INTO Pagamentos(reserva_id,valor,metodo,registrado_por) VALUES(?,?,?,NULL)',[r.id,allocation,method]);
        left-=allocation;
      }
      await recompute(r.id);
    }
    // An excess/late payment remains a real credit and is flagged for reconciliation.
    if(left>0 || reservations.some(r=>['Cancelada','Cancelamento pendente'].includes(r.status))) {
      await db.runAsync('INSERT OR IGNORE INTO SecurityOutbox(id,kind,payload,created) VALUES(?,?,?,?)',['review:'+gatewayRef,'payment_review',JSON.stringify({gateway_ref:gatewayRef,excess_cents:left,tenant_id:reserva.tenant_id}),Date.now()]);
    }
    await db.runAsync("UPDATE TransacoesGateway SET status='Pago',atualizado_em=CURRENT_TIMESTAMP WHERE id=?",[tx.id]);
    await db.runAsync("UPDATE PaymentIntents SET state='paid',updated=? WHERE gateway_ref=?",[Date.now(),gatewayRef]);
    return {status:'success',reserva_id:tx.reserva_id};
  });
}
async function reverse(gatewayRef,refundedAmount) {
  await ensureSecuritySchema(db);
  return db.transaction(async()=>{
    const credit=await db.getAsync('SELECT amount_cents FROM GatewayCredits WHERE gateway_ref=?',[gatewayRef]);
    if(!credit) throw httpError(409,'Pagamento legado requer conciliação antes do estorno.');
    const desired=Number(refundedAmount);
    if(desired>credit.amount_cents) throw httpError(400,'Estorno acima do valor recebido.');
    const previous=await db.getAsync("SELECT response_json FROM RefundIntents WHERE id=?",['provider:'+gatewayRef]);
    const already=previous?Number(previous.response_json):0;
    if(desired<=already) return;
    let remaining=desired-already;
    const allocations=await db.allAsync('SELECT * FROM PaymentAllocations WHERE gateway_ref=? ORDER BY reserva_id DESC',[gatewayRef]);
    const unallocated=Math.max(0,credit.amount_cents-already-allocations.reduce((sum,a)=>sum+a.amount_cents,0));
    remaining=Math.max(0,remaining-unallocated);
    for(const a of allocations) {
      const deducted=Math.min(remaining,a.amount_cents);
      if(deducted) {
        await db.runAsync('INSERT INTO Pagamentos(reserva_id,valor,metodo) VALUES(?,?,?)',[a.reserva_id,-deducted,'Estorno']);
        await db.runAsync('UPDATE PaymentAllocations SET amount_cents=amount_cents-? WHERE gateway_ref=? AND reserva_id=?',[deducted,gatewayRef,a.reserva_id]);
        await recompute(a.reserva_id);remaining-=deducted;
      }
    }
    await db.runAsync("INSERT INTO RefundIntents(id,gateway_ref,amount_cents,state,response_json,created) VALUES(?,?,?,'completed',?,?) ON CONFLICT(id) DO UPDATE SET amount_cents=excluded.amount_cents,response_json=excluded.response_json",['provider:'+gatewayRef,gatewayRef,desired,String(desired),Date.now()]);
    if(desired===credit.amount_cents) await db.runAsync("UPDATE TransacoesGateway SET status='Estornado' WHERE gateway_ref=?",[gatewayRef]);
  });
}
module.exports={settle,recompute,scopeReservations,reverse};
