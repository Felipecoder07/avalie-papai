const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');
const { getTodayString, getLocalTimeString } = require('../utils/dateUtils');

// Listar grade de quadras e horários ocupados
const listarGrade = async (req, res) => {
  try {
    const { data, data_inicio, data_fim } = req.query;
    const inicio = data_inicio || data;
    const fim = data_fim || data;

    if (!inicio || !fim) return res.status(400).json({ error: 'Data ou intervalo de datas é obrigatório' });

    const tenant_id = req.user.tenant_id;

    // Pegar todas as quadras ativas
    const quadras = await db.allAsync('SELECT * FROM Quadras WHERE status = "Ativa" AND tenant_id = ?', [tenant_id]);

    // Pegar reservas confirmadas/pendentes/parciais do intervalo
    const reservas = await db.allAsync(`
      SELECT r.*, c.nome as cliente_nome,
             COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id), 0) as valor_pago
      FROM Reservas r 
      LEFT JOIN Clientes c ON r.cliente_id = c.id
      WHERE r.data_reserva >= ? AND r.data_reserva <= ? AND r.status != 'Cancelada' AND r.tenant_id = ?
    `, [inicio, fim, tenant_id]);

    // Pegar bloqueios do intervalo
    const bloqueios = await db.allAsync(`
      SELECT b.* FROM Bloqueios b
      JOIN Quadras q ON b.quadra_id = q.id
      WHERE b.data_bloqueio >= ? AND b.data_bloqueio <= ? AND q.tenant_id = ?
    `, [inicio, fim, tenant_id]);

    res.json({ quadras, reservas, bloqueios });
  } catch (error) {
    console.error('Erro ao listar grade:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

function calcularPrecoReserva(quadra, esporte, hora_inicio, hora_fim, valorTotalInformado) {
  if (valorTotalInformado !== undefined && valorTotalInformado !== null && valorTotalInformado !== '') {
    return Math.max(0, Number(valorTotalInformado));
  }

  const [hI, mI] = hora_inicio.split(':').map(Number);
  const [hF, mF] = hora_fim.split(':').map(Number);
  let precoHora = quadra.preco_base || 80;

  if (quadra.modalidades) {
    try {
      const parsed = typeof quadra.modalidades === 'string' ? JSON.parse(quadra.modalidades) : quadra.modalidades;
      if (Array.isArray(parsed)) {
        const match = parsed.find(m => (typeof m === 'object' ? m.nome : m) === esporte);
        if (match && typeof match === 'object' && match.preco != null && Number(match.preco) > 0) {
          precoHora = Number(match.preco);
        }
      }
    } catch {
      // Ignorar erro de parsing de modalidades
    }
  }

  const duracaoHoras = (hF + mF / 60) - (hI + mI / 60);
  return precoHora * duracaoHoras;
}

async function processarPagamentoBalcao(reservaId, valor_total, pagamento, usuario_id, ip) {
  if (!pagamento || !pagamento.registrar || valor_total <= 0) {
    return valor_total === 0 ? 'Pago' : 'Pendente';
  }

  const valorPago = Math.max(0, Number(pagamento.valor || valor_total));
  const metodoPago = pagamento.metodo || 'Dinheiro';
  
  await db.runAsync(`
    INSERT INTO Pagamentos (reserva_id, valor, metodo, registrado_por)
    VALUES (?, ?, ?, ?)
  `, [reservaId, valorPago, metodoPago, usuario_id]);

  const statusPagamento = valorPago >= valor_total ? 'Pago' : 'Parcial';
  await db.runAsync(`UPDATE Reservas SET status_pagamento = ? WHERE id = ?`, [statusPagamento, reservaId]);

  logAuditEvent(
    usuario_id,
    'Pagamento Balcão',
    `Pagamento de R$ ${valorPago.toFixed(2)} registrado via '${metodoPago}' para Reserva ID #${reservaId}.`,
    ip
  );

  return statusPagamento;
}

async function dispararEmailConfirmacao(tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total) {
  try {
    const client = await db.getAsync('SELECT nome, email FROM Clientes WHERE id = ?', [cliente_id]);
    const arena = await db.getAsync('SELECT nome FROM Arenas WHERE id = ?', [tenant_id]);
    const quadraObj = await db.getAsync('SELECT nome FROM Quadras WHERE id = ?', [quadra_id]);
    
    if (client && client.email) {
      const { sendEmail } = require('../services/emailService');
      const subject = `Reserva Confirmada - ${arena ? arena.nome : 'Arenix'}`;
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
          <h2 style="color: #2F855A;">Olá, ${client.nome}! 🎉</h2>
          <p>Temos uma ótima notícia! Sua reserva foi agendada e confirmada com sucesso.</p>
          <div style="background-color: #F7FAFC; border: 1px solid #E2E8F0; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Detalhes do agendamento:</strong><br />
            📅 <strong>Data:</strong> ${data_reserva.split('-').reverse().join('/')}<br />
            🕒 <strong>Horário:</strong> ${hora_inicio} às ${hora_fim}<br />
            🎾 <strong>Quadra:</strong> ${quadraObj ? quadraObj.nome : 'Quadra Principal'}<br />
            💰 <strong>Valor Total:</strong> R$ ${valor_total.toFixed(2).replace('.', ',')}
          </div>
          <p>Agradecemos a preferência! Nos vemos na quadra.</p>
          <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 20px 0;" />
          <p style="font-size: 0.8em; color: #A0AEC0;">Esta é uma mensagem automática enviada por Arenix CourtManager em nome de ${arena ? arena.nome : 'sua Arena'}.</p>
        </div>
      `;
      await sendEmail(client.email, subject, html);
    }
  } catch (e) {
    console.error('[SMTP] Erro ao disparar e-mail de confirmação:', e.message);
  }
}

const criarReserva=async(req,res)=>{
 try {
  const {cents,httpError}=require('../utils/security');
  const tenant=req.user.tenant_id,item=req.body;
  const result=await db.transaction(async()=>{
   const court=await require('../services/bookingService').validateSlot(tenant,item);
   const client=await db.getAsync('SELECT id FROM Clientes WHERE id=? AND tenant_id=? AND ativo=1',[item.cliente_id,tenant]);
   if(!client) throw httpError(404,'Cliente nao pertence a esta arena.');
   const computed=Math.round(calcularPrecoReserva(court,item.esporte,item.hora_inicio,item.hora_fim)*100);
   let total=computed;
   if(item.valor_total!==undefined && cents(item.valor_total,{zero:true})!==computed){
    total=cents(item.valor_total,{zero:true});
    if(!['Administrador','Gerente'].includes(req.user.perfil)||!item.justificativa_desconto||total>computed||(req.user.perfil==='Gerente'&&total<Math.ceil(computed*0.7))) throw httpError(403,'Alteracao de preco exige desconto autorizado e justificativa.');
   }
   const inserted=await db.runAsync("INSERT INTO Reservas(tenant_id,cliente_id,quadra_id,data_reserva,hora_inicio,hora_fim,valor_total,status,status_pagamento,criado_por,esporte) VALUES(?,?,?,?,?,?,?,'Confirmada',?,?,?)",[tenant,client.id,item.quadra_id,item.data_reserva,item.hora_inicio,item.hora_fim,total/100,total===0?'Pago':'Pendente',req.user.id,item.esporte||'Geral']);
   if(item.pagamento?.registrar){
    const paid=cents(item.pagamento.valor===undefined?total/100:item.pagamento.valor);
    if(paid>total) throw httpError(400,'Pagamento acima do saldo.');
    const method=require('../services/manualPaymentService').manualMethod(item.pagamento.metodo);
    await db.runAsync('INSERT INTO Pagamentos(reserva_id,valor,metodo,registrado_por) VALUES(?,?,?,?)',[inserted.lastID,paid/100,method,req.user.id]);
   }
   const balance=await require('../services/paymentLedgerService').recompute(inserted.lastID);
   return {reserva_id:inserted.lastID,valor_total:total/100,status_pagamento:balance.novoStatus};
  });
  logAuditEvent(req.user.id,'Criacao de reserva','Reserva: '+result.reserva_id,req.ip);
  res.status(201).json({message:'Reserva criada.',...result});
 }catch(e){res.status(e.status||500).json({error:e.status?e.message:'Erro ao criar reserva.'});}
};

const minhasReservas = async (req, res) => {
  try {
    const { cliente_id } = req.user;
    if (!cliente_id) {
      return res.status(403).json({ error: 'Usuário não tem perfil de cliente vinculado.' });
    }

    const tenant_id = req.user.tenant_id;
    const reservas = await db.allAsync(`
      SELECT r.id, r.data_reserva, r.hora_inicio, r.hora_fim, r.status, r.valor_total, r.status_pagamento, q.nome as quadra_nome 
      FROM Reservas r
      JOIN Quadras q ON r.quadra_id = q.id
      WHERE r.cliente_id = ? AND r.tenant_id = ?
      ORDER BY r.data_reserva DESC, r.hora_inicio DESC
    `, [cliente_id, tenant_id]);

    res.json(reservas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar reservas do cliente.' });
  }
};

const cancelarReserva = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo, observacoes } = req.body; // 'motivo' now actually expects motivo_id from frontend
    const tenant_id = req.user.tenant_id;

    const reserva = await db.getAsync('SELECT * FROM Reservas WHERE id = ? AND tenant_id = ?', [id, tenant_id]);
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada.' });

    let novoStatusPagamento = reserva.status_pagamento;
    if (reserva.status_pagamento === 'Pendente') {
      novoStatusPagamento = 'Cancelado';
    } else if (reserva.status_pagamento === 'Pago') {
      novoStatusPagamento = 'Estornado';
    }

    // Busca o texto do motivo para o log
    // Busca o texto do motivo para o log
    let motivoTexto = 'Motivo desconhecido';
    if (motivo) {
      if (motivo == -1) motivoTexto = 'Desistência do Cliente';
      else if (motivo == -2) motivoTexto = 'Condições Climáticas';
      else if (motivo == -3) motivoTexto = 'Manutenção da Quadra';
      else {
        const m = await db.getAsync('SELECT motivo FROM MotivosCancelamento WHERE id = ?', [motivo]);
        if (m) motivoTexto = m.motivo;
      }
    }

    let grupoClause = 'WHERE id = ? AND tenant_id = ?';
    let grupoParams = [id, tenant_id];

    if (reserva.grupo_id && String(reserva.grupo_id).trim() !== '') {
      grupoClause = 'WHERE grupo_id = ? AND tenant_id = ?';
      grupoParams = [reserva.grupo_id, tenant_id];
    }

    await db.runAsync(
      `UPDATE Reservas SET status = "Cancelada", status_pagamento = ?, motivo_cancelamento_id = ?, observacoes_cancelamento = ? ${grupoClause}`,
      [novoStatusPagamento, motivo || null, observacoes || null, ...grupoParams]
    );

    logAuditEvent(req.user.id, 'Cancelamento de reserva', `Reserva ID: ${id}, Motivo: ${motivoTexto}`, req.ip);

    // Dispara e-mail de cancelamento em background (defensivo)
    (async () => {
      try {
        const client = await db.getAsync('SELECT nome, email FROM Clientes WHERE id = ?', [reserva.cliente_id]);
        const arena = await db.getAsync('SELECT nome FROM Arenas WHERE id = ?', [tenant_id]);
        const quadraObj = await db.getAsync('SELECT nome FROM Quadras WHERE id = ?', [reserva.quadra_id]);
        
        if (client && client.email) {
          const { sendEmail } = require('../services/emailService');
          const subject = `Reserva Cancelada - ${arena ? arena.nome : 'Arenix'}`;
          const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
              <h2 style="color: #C53030;">Reserva Cancelada 🚫</h2>
              <p>Olá, ${client.nome}. Informamos que a sua reserva foi cancelada no sistema.</p>
              <div style="background-color: #FFF5F5; border: 1px solid #FEB2B2; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <strong>Detalhes do agendamento cancelado:</strong><br />
                📅 <strong>Data:</strong> ${reserva.data_reserva.split('-').reverse().join('/')}<br />
                🕒 <strong>Horário:</strong> ${reserva.hora_inicio} às ${reserva.hora_fim}<br />
                🎾 <strong>Quadra:</strong> ${quadraObj ? quadraObj.nome : 'Quadra Principal'}<br />
                ❌ <strong>Motivo do Cancelamento:</strong> ${motivoTexto}
              </div>
              <p>Se você tiver dúvidas ou precisar reagendar, entre em contato diretamente com a equipe da arena.</p>
              <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 20px 0;" />
              <p style="font-size: 0.8em; color: #A0AEC0;">Esta é uma mensagem automática enviada por Arenix CourtManager em nome de ${arena ? arena.nome : 'sua Arena'}.</p>
            </div>
          `;
          await sendEmail(client.email, subject, html);
        }
      } catch (e) {
        console.error('[SMTP] Erro ao disparar e-mail de cancelamento:', e.message);
      }
    })();

    res.json({ message: 'Reserva cancelada com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao cancelar reserva.' });
  }
};

const criarBloqueio = async (req, res) => {
  try {
    const { quadra_id, data_bloqueio, hora_inicio, hora_fim, motivo } = req.body;
    const usuario_id = req.user ? req.user.id : null;

    if (!quadra_id || !data_bloqueio || !hora_inicio || !hora_fim || !motivo) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(Date.now() - tzOffset).toISOString();
    const todayStr = localISOTime.split('T')[0];
    const currentTimeStr = localISOTime.split('T')[1].substring(0, 5);

    if (data_bloqueio < todayStr) {
      return res.status(400).json({ error: 'Não é permitido criar bloqueios em datas passadas.' });
    }
    if (data_bloqueio === todayStr && hora_fim <= currentTimeStr) {
      return res.status(400).json({ error: 'Não é permitido criar bloqueios em horários que já se encerraram.' });
    }

    const tenant_id = req.user.tenant_id;
    const quadra = await db.getAsync('SELECT id FROM Quadras WHERE id = ? AND tenant_id = ?', [quadra_id, tenant_id]);
    if (!quadra) return res.status(404).json({ error: 'Quadra não encontrada ou não pertence a esta arena.' });

    const conflitoReservas = await db.getAsync(`
      SELECT id FROM Reservas 
      WHERE quadra_id = ? AND data_reserva = ? AND status != 'Cancelada' AND tenant_id = ?
      AND (hora_inicio < ? AND hora_fim > ?)
    `, [quadra_id, data_bloqueio, tenant_id, hora_fim, hora_inicio]);

    if (conflitoReservas) {
      return res.status(409).json({ error: 'Não é possível bloquear: já existe uma reserva confirmada neste horário.' });
    }

    const insert = await db.runAsync(`
      INSERT INTO Bloqueios (quadra_id, data_bloqueio, hora_inicio, hora_fim, motivo, criado_por)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [quadra_id, data_bloqueio, hora_inicio, hora_fim, motivo, usuario_id]);

    logAuditEvent(usuario_id, 'Criação de bloqueio', `Bloqueio ID: ${insert.lastID}, Quadra: ${quadra_id}, Data: ${data_bloqueio}`, req.ip);

    res.status(201).json({ message: 'Quadra bloqueada com sucesso.', bloqueio_id: insert.lastID });
  } catch (error) {
    console.error('Erro ao criar bloqueio:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

const removerBloqueio = async (req, res) => {
  try {
    const { id } = req.params;
    const usuario_id = req.user ? req.user.id : null;

    const tenant_id = req.user.tenant_id;

    const bloqueio = await db.getAsync(`
      SELECT b.* FROM Bloqueios b
      JOIN Quadras q ON b.quadra_id = q.id
      WHERE b.id = ? AND q.tenant_id = ?
    `, [id, tenant_id]);
    if (!bloqueio) return res.status(404).json({ error: 'Bloqueio não encontrado.' });

    await db.runAsync('DELETE FROM Bloqueios WHERE id = ?', [id]);

    logAuditEvent(usuario_id, 'Remoção de bloqueio', `Bloqueio ID: ${id} removido integralmente`, req.ip);

    res.json({ message: 'Bloqueio removido com sucesso.' });
  } catch (error) {
    console.error('Erro ao remover bloqueio:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

const desbloquearParcialmente = async (req, res) => {
  try {
    const { id } = req.params;
    const { hora_inicio_desbloqueio, hora_fim_desbloqueio } = req.body;
    const usuario_id = req.user ? req.user.id : null;

    const tenant_id = req.user.tenant_id;

    const b = await db.getAsync(`
      SELECT b.* FROM Bloqueios b
      JOIN Quadras q ON b.quadra_id = q.id
      WHERE b.id = ? AND q.tenant_id = ?
    `, [id, tenant_id]);
    if (!b) return res.status(404).json({ error: 'Bloqueio não encontrado.' });

    // Se o desbloqueio for exatamente igual ao bloqueio, removemos
    if (b.hora_inicio >= hora_inicio_desbloqueio && b.hora_fim <= hora_fim_desbloqueio) {
      await db.runAsync('DELETE FROM Bloqueios WHERE id = ?', [id]);
    } else if (b.hora_inicio === hora_inicio_desbloqueio) {
      // Começa igual, então só empurramos o início do bloqueio mais pra frente
      await db.runAsync('UPDATE Bloqueios SET hora_inicio = ? WHERE id = ?', [hora_fim_desbloqueio, id]);
    } else if (b.hora_fim === hora_fim_desbloqueio) {
      // Termina igual, recuamos o final do bloqueio
      await db.runAsync('UPDATE Bloqueios SET hora_fim = ? WHERE id = ?', [hora_inicio_desbloqueio, id]);
    } else {
      // Furo no meio: atualiza o atual para terminar no início do furo, e cria um novo começando no fim do furo
      await db.runAsync('UPDATE Bloqueios SET hora_fim = ? WHERE id = ?', [hora_inicio_desbloqueio, id]);
      await db.runAsync(`
        INSERT INTO Bloqueios (quadra_id, data_bloqueio, hora_inicio, hora_fim, motivo, criado_por)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [b.quadra_id, b.data_bloqueio, hora_fim_desbloqueio, b.hora_fim, b.motivo, b.criado_por]);
    }

    logAuditEvent(usuario_id, 'Desbloqueio Parcial', `Bloqueio ID: ${id}, Furo: ${hora_inicio_desbloqueio} - ${hora_fim_desbloqueio}`, req.ip);
    res.json({ message: 'Horário desbloqueado com sucesso.' });
  } catch (error) {
    console.error('Erro ao desbloquear parcialmente:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const desbloquearHoraDelete = async (req, res) => {
  try {
    const { id } = req.params;
    const { hora } = req.query; 
    if (!hora) return res.status(400).json({ error: 'Parâmetro "hora" é obrigatório.' });

    const tenant_id = req.user.tenant_id;
    const b = await db.getAsync(`
      SELECT b.* FROM Bloqueios b
      JOIN Quadras q ON b.quadra_id = q.id
      WHERE b.id = ? AND q.tenant_id = ?
    `, [id, tenant_id]);
    if (!b) return res.status(404).json({ error: 'Bloqueio não encontrado.' });

    const [h, m] = hora.split(':').map(Number);
    const nextH = h + 1;
    const hora_inicio_desbloqueio = hora;
    const hora_fim_desbloqueio = `${nextH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    if (b.hora_inicio >= hora_inicio_desbloqueio && b.hora_fim <= hora_fim_desbloqueio) {
      await db.runAsync('DELETE FROM Bloqueios WHERE id = ?', [id]);
    } else if (b.hora_inicio === hora_inicio_desbloqueio) {
      await db.runAsync('UPDATE Bloqueios SET hora_inicio = ? WHERE id = ?', [hora_fim_desbloqueio, id]);
    } else if (b.hora_fim === hora_fim_desbloqueio) {
      await db.runAsync('UPDATE Bloqueios SET hora_fim = ? WHERE id = ?', [hora_inicio_desbloqueio, id]);
    } else {
      await db.runAsync('UPDATE Bloqueios SET hora_fim = ? WHERE id = ?', [hora_inicio_desbloqueio, id]);
      await db.runAsync(`
        INSERT INTO Bloqueios (quadra_id, data_bloqueio, hora_inicio, hora_fim, motivo, criado_por)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [b.quadra_id, b.data_bloqueio, hora_fim_desbloqueio, b.hora_fim, b.motivo, b.criado_por]);
    }

    logAuditEvent(req.user.id, 'Desbloqueio Parcial', `Bloqueio ID: ${id}, Furo: ${hora_inicio_desbloqueio} - ${hora_fim_desbloqueio}`, req.ip);
    res.json({ message: 'Horário desbloqueado com sucesso.' });
  } catch (error) {
    console.error('Erro ao desbloquear parcialmente via DELETE:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

module.exports = { 
  listarGrade, 
  criarReserva, 
  minhasReservas, 
  cancelarReserva, 
  criarBloqueio, 
  removerBloqueio, 
  desbloquearParcialmente,
  desbloquearHoraDelete
};
