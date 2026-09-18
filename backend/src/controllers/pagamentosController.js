const db=require('../config/database');
const logAuditEvent=require('../utils/auditLogger');
const {getTodayString,getLocalTimeString}=require('../utils/dateUtils');
const {cents,httpError}=require('../utils/security');
const {recompute}=require('../services/paymentLedgerService');
const {manualMethod}=require('../services/manualPaymentService');
const safe=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){res.status(e.status||500).json({error:e.status?e.message:'Falha na operacao financeira.'})}};
const registrarPagamento=safe(async(req,res)=>{
 const amount=cents(req.body.valor),method=manualMethod(req.body.metodo),tenant=req.user.tenant_id,id=req.body.reserva_id;
 const result=await db.transaction(async()=>{
  const r=await db.getAsync('SELECT * FROM Reservas WHERE id=? AND tenant_id=?',[id,tenant]);
  if(!r) throw httpError(404,'Reserva nao encontrada.');
  if(r.status==='Cancelada') throw httpError(400,'Reserva cancelada.');
  const paid=await db.getAsync('SELECT COALESCE(SUM(valor),0) AS total FROM Pagamentos WHERE reserva_id=?',[id]);
  if(amount>cents(r.valor_total,{zero:true})-Math.round(paid.total*100)) throw httpError(400,'Valor acima do saldo devedor.');
  const inserted=await db.runAsync('INSERT INTO Pagamentos(reserva_id,valor,metodo,registrado_por) VALUES(?,?,?,?)',[id,amount/100,method,req.user.id]);
  return {pagamento_id:inserted.lastID,...await recompute(id)};
 });
 logAuditEvent(req.user.id,'Pagamento manual','Reserva: '+id+', valor: '+amount/100,req.ip);
 res.status(201).json({message:'Pagamento registrado.',pagamento_id:result.pagamento_id,saldo_devedor:result.saldoDevedor,status_pagamento:result.novoStatus});
});
const aplicarDesconto=safe(async(req,res)=>{
 const percent=Number(req.body.desconto_percentual);
 if(!['Administrador','Gerente'].includes(req.user.perfil)) throw httpError(403,'Perfil nao autorizado.');
 if(typeof req.body.desconto_percentual!=='number'||!Number.isFinite(percent)||percent<0||percent>100) throw httpError(400,'Desconto invalido.');
 if(req.user.perfil==='Gerente'&&percent>30) throw httpError(403,'Limite do gerente: 30%.');
 const result=await db.transaction(async()=>{
  const r=await db.getAsync('SELECT * FROM Reservas WHERE id=? AND tenant_id=?',[req.body.reserva_id,req.user.tenant_id]);
  if(!r) throw httpError(404,'Reserva nao encontrada.');
  const paid=await db.getAsync('SELECT COALESCE(SUM(valor),0) AS total FROM Pagamentos WHERE reserva_id=?',[r.id]);
  const total=Math.round(cents(r.valor_total,{zero:true})*(100-percent)/100);
  if(total<Math.round(paid.total*100)||r.status==='Cancelada') throw httpError(400,'Desconto abaixo do recebido ou reserva cancelada.');
  const open=await db.getAsync("SELECT id FROM TransacoesGateway WHERE reserva_id=? AND status='Pendente'",[r.id]);
  if(open) throw httpError(409,'Existe cobranca online pendente.');
  await db.runAsync('UPDATE Reservas SET valor_total=? WHERE id=?',[total/100,r.id]);
  return {novo_valor_total:total/100,...await recompute(r.id)};
 });
 res.json({message:'Desconto aplicado.',novo_valor_total:result.novo_valor_total,saldo_devedor:result.saldoDevedor});
});
const registrarEstorno=safe(async(req,res)=>{
 if(req.user.perfil!=='Administrador') throw httpError(403,'Perfil nao autorizado.');
 const result=await db.transaction(async()=>{
  const r=await db.getAsync('SELECT r.* FROM Reservas r WHERE r.tenant_id=? AND r.id=COALESCE(?,(SELECT reserva_id FROM Pagamentos WHERE id=?))',[req.user.tenant_id,req.body.reserva_id,req.body.pagamento_id]);
  if(!r) throw httpError(404,'Pagamento nao encontrado.');
  // Online refunds must use the provider and its persisted allocation; never create a manual receipt.
  const online=await db.getAsync("SELECT id FROM TransacoesGateway WHERE reserva_id IN (SELECT id FROM Reservas WHERE id=? OR (grupo_id=? AND tenant_id=?))",[r.id,r.grupo_id,r.tenant_id]);
  if(online) throw httpError(409,'Pagamento online: use o cancelamento com devolucao pelo provedor.');
  const paid=await db.getAsync('SELECT COALESCE(SUM(valor),0) AS total FROM Pagamentos WHERE reserva_id=?',[r.id]);
  const amount=req.body.valor===undefined?Math.round(paid.total*100):cents(req.body.valor);
  if(amount<=0||amount>Math.round(paid.total*100)) throw httpError(400,'Valor acima do saldo estornavel.');
  await db.runAsync('INSERT INTO Pagamentos(reserva_id,valor,metodo,registrado_por) VALUES(?,?,?,?)',[r.id,-amount/100,'Estorno',req.user.id]);
  return recompute(r.id);
 });
 res.json({message:'Estorno manual registrado.',saldo_devedor:result.saldoDevedor,status_pagamento:result.novoStatus});
});

const resumoPagamentos = async (req, res) => {
  try {
    const hoje = getTodayString();
    const tenant_id = req.user.tenant_id;
    const mes = hoje.substring(0, 7);
    const hora = getLocalTimeString();
    const dataFiltro = req.query.data ? req.query.data.trim() : null;

    // Recebido hoje (apenas reservas ativas/não canceladas)
    const recebidoHoje = await db.getAsync(
      `SELECT COALESCE(SUM(p.valor),0) as total, COUNT(CASE WHEN p.valor > 0 THEN 1 END) as qtd 
       FROM Pagamentos p 
       JOIN Reservas r ON p.reserva_id = r.id 
       WHERE DATE(p.registrado_em) = ? AND r.status != 'Cancelada' AND r.tenant_id = ?`,
      [hoje, tenant_id]);

    // Pendente hoje
    const pendenteHoje = await db.allAsync(
      `SELECT r.valor_total, COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id),0) as pago
       FROM Reservas r WHERE r.data_reserva = ? AND r.status != 'Cancelada' AND r.status_pagamento != 'Pago' AND r.tenant_id = ?`,
      [hoje, tenant_id]);
    const totalPendenteHoje = pendenteHoje.reduce((acc, r) => acc + Math.max(0, r.valor_total - r.pago), 0);

    // Recebido no mês (apenas reservas ativas/não canceladas)
    const recebidoMes = await db.getAsync(
      `SELECT COALESCE(SUM(p.valor),0) as total 
       FROM Pagamentos p 
       JOIN Reservas r ON p.reserva_id = r.id 
       WHERE strftime('%Y-%m', p.registrado_em) = ? AND r.status != 'Cancelada' AND r.tenant_id = ?`,
      [mes, tenant_id]);

    // Inadimplência global para o card
    const inadimplentes = await db.allAsync(
      `SELECT r.valor_total, COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id),0) as pago
       FROM Reservas r WHERE r.status != 'Cancelada' AND r.status_pagamento != 'Pago' AND r.tenant_id = ?`,
      [tenant_id]
    );
    const totalInadimplencia = inadimplentes.reduce((acc, r) => acc + Math.max(0, r.valor_total - r.pago), 0);

    // Contagens Globais para as Tabs
    const countPendentes = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND status_pagamento != 'Pago' AND tenant_id = ?`, [tenant_id]);
    const countPagos = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND status_pagamento = 'Pago' AND tenant_id = ?`, [tenant_id]);
    const countTodos = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND tenant_id = ?`, [tenant_id]);
    const countInadimplentes = await db.getAsync(`
      SELECT COUNT(*) as c FROM Reservas 
      WHERE status != 'Cancelada' AND status_pagamento != 'Pago' AND tenant_id = ?
      AND (data_reserva < ? OR (data_reserva = ? AND hora_fim < ?))
    `, [tenant_id, hoje, hoje, hora]);

    let resumoFiltrado = null;
    let countsFiltrados = {
      pendentes: countPendentes.c,
      pagos: countPagos.c,
      todos: countTodos.c,
      inadimplentes: countInadimplentes.c
    };

    if (dataFiltro) {
      // Recebido na data selecionada (apenas reservas ativas/não canceladas)
      const recebidoData = await db.getAsync(
        `SELECT COALESCE(SUM(p.valor),0) as total, COUNT(CASE WHEN p.valor > 0 THEN 1 END) as qtd 
         FROM Pagamentos p 
         JOIN Reservas r ON p.reserva_id = r.id 
         WHERE (DATE(p.registrado_em) = ? OR r.data_reserva = ?) AND r.status != 'Cancelada' AND r.tenant_id = ?`,
        [dataFiltro, dataFiltro, tenant_id]
      );

      // Pendente na data selecionada
      const pendenteData = await db.allAsync(
        `SELECT r.valor_total, COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id),0) as pago
         FROM Reservas r WHERE r.data_reserva = ? AND r.status != 'Cancelada' AND r.status_pagamento != 'Pago' AND r.tenant_id = ?`,
        [dataFiltro, tenant_id]
      );
      const totalPendenteData = pendenteData.reduce((acc, r) => acc + Math.max(0, r.valor_total - r.pago), 0);

      // Total faturado/agendado na data selecionada
      const faturamentoData = await db.getAsync(
        `SELECT COALESCE(SUM(valor_total),0) as total, COUNT(*) as qtd 
         FROM Reservas 
         WHERE data_reserva = ? AND status != 'Cancelada' AND tenant_id = ?`,
        [dataFiltro, tenant_id]
      );

      // Contagens na data selecionada
      const countPendData = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND status_pagamento != 'Pago' AND data_reserva = ? AND tenant_id = ?`, [dataFiltro, tenant_id]);
      const countPagData = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND status_pagamento = 'Pago' AND data_reserva = ? AND tenant_id = ?`, [dataFiltro, tenant_id]);
      const countTodosData = await db.getAsync(`SELECT COUNT(*) as c FROM Reservas WHERE status != 'Cancelada' AND data_reserva = ? AND tenant_id = ?`, [dataFiltro, tenant_id]);
      const countInadData = await db.getAsync(`
        SELECT COUNT(*) as c FROM Reservas 
        WHERE status != 'Cancelada' AND status_pagamento != 'Pago' AND data_reserva = ? AND tenant_id = ?
        AND (data_reserva < ? OR (data_reserva = ? AND hora_fim < ?))
      `, [dataFiltro, tenant_id, hoje, hoje, hora]);

      countsFiltrados = {
        pendentes: countPendData.c,
        pagos: countPagData.c,
        todos: countTodosData.c,
        inadimplentes: countInadData.c
      };

      resumoFiltrado = {
        data: dataFiltro,
        recebido: recebidoData.total,
        qtdPagamentos: recebidoData.qtd,
        pendente: totalPendenteData,
        qtdPendente: pendenteData.length,
        faturamentoTotal: faturamentoData.total,
        totalReservas: faturamentoData.qtd,
        qtdInadimplentes: countInadData.c
      };
    }

    res.json({
      recebidoHoje: recebidoHoje.total,
      qtdPagamentosHoje: recebidoHoje.qtd,
      pendenteHoje: totalPendenteHoje,
      qtdPendenteHoje: pendenteHoje.length,
      recebidoMes: recebidoMes.total,
      totalInadimplencia,
      qtdInadimplentes: countInadimplentes.c,
      dataFiltro,
      resumoFiltrado,
      counts: countsFiltrados,
      countsGlobais: {
        pendentes: countPendentes.c,
        pagos: countPagos.c,
        todos: countTodos.c,
        inadimplentes: countInadimplentes.c
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar resumo de pagamentos.' });
  }
};

// ─── LISTAGEM DE RESERVAS COM PAGAMENTOS ─────────────────────────────────────
const listarReservasPagamentos = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const { status, busca, data } = req.query;

    let where = `r.tenant_id = ? AND r.status != 'Cancelada'`;
    const params = [tenant_id];

    if (status === 'Pendente') {
      where += ` AND r.status_pagamento IN ('Pendente', 'Parcial')`;
    } else if (status === 'Pago') {
      where += ` AND r.status_pagamento = 'Pago'`;
    } else if (status === 'inadimplentes') {
      // reservas cujo horário já passou e ainda não foram pagas
      const hoje = new Date().toISOString().split('T')[0];
      const tenant_id = req.user.tenant_id;
      const hora = new Date().toTimeString().substring(0, 5);
      where += ` AND r.status_pagamento != 'Pago'
                 AND (r.data_reserva < ? OR (r.data_reserva = ? AND r.hora_fim < ?))`;
      params.push(hoje, hoje, hora);
    }

    if (data) {
      where += ` AND r.data_reserva = ?`;
      params.push(data);
    }

    if (busca) {
      where += ` AND (c.nome LIKE ? OR CAST(r.id AS TEXT) LIKE ?)`;
      params.push(`%${busca}%`, `%${busca}%`);
    }

    const reservas = await db.allAsync(`
      SELECT
        r.id, r.data_reserva, r.hora_inicio, r.hora_fim,
        r.valor_total, r.status, r.status_pagamento,
        c.nome AS cliente_nome, c.telefone AS cliente_telefone,
        q.nome AS quadra_nome,
        COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id), 0) AS total_pago,
        COALESCE((SELECT GROUP_CONCAT(DISTINCT metodo) FROM Pagamentos WHERE reserva_id = r.id AND metodo != 'Estorno'), '') AS metodos
      FROM Reservas r
      JOIN Clientes c ON r.cliente_id = c.id
      JOIN Quadras q ON r.quadra_id = q.id
      WHERE ${where}
      ORDER BY r.data_reserva DESC, r.hora_inicio DESC
    `, params);

    const comSaldo = reservas.map(r => ({
      ...r,
      saldo_devedor: Math.max(0, r.valor_total - r.total_pago)
    }));

    res.json(comSaldo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar reservas para pagamentos.' });
  }
};

module.exports = { registrarPagamento, aplicarDesconto, registrarEstorno, resumoPagamentos, listarReservasPagamentos };
