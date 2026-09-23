const logger = require('../utils/safeLogger').forModule('reservasController');
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
    const quadras = await db.allAsync('SELECT id,nome,tipo,modalidades,preco_base,hora_abertura,hora_fechamento,status FROM Quadras WHERE status = "Ativa" AND tenant_id = ?', [tenant_id]);

    // Pegar reservas confirmadas/pendentes/parciais do intervalo
    const reservas = await db.allAsync(`
      SELECT r.id,r.cliente_id,r.quadra_id,r.data_reserva,r.hora_inicio,r.hora_fim,r.valor_total,r.status,r.status_pagamento,r.esporte,r.grupo_id,COALESCE(bc.nome,c.nome) as cliente_nome,
             COALESCE((SELECT SUM(valor) FROM Pagamentos WHERE reserva_id = r.id), 0) as valor_pago
      FROM Reservas r 
      LEFT JOIN Clientes c ON r.cliente_id = c.id AND c.tenant_id=r.tenant_id
      LEFT JOIN BookingContacts bc ON bc.grupo_id=r.grupo_id AND bc.tenant_id=r.tenant_id
      WHERE r.data_reserva >= ? AND r.data_reserva <= ? AND r.status != 'Cancelada' AND r.tenant_id = ?
    `, [inicio, fim, tenant_id]);

    // Pegar bloqueios do intervalo
    const bloqueios = await db.allAsync(`
      SELECT b.id,b.quadra_id,b.data_bloqueio,b.hora_inicio,b.hora_fim,b.motivo FROM Bloqueios b
      JOIN Quadras q ON b.quadra_id = q.id
      WHERE b.data_bloqueio >= ? AND b.data_bloqueio <= ? AND q.tenant_id = ?
    `, [inicio, fim, tenant_id]);

    const formattedQuadras = quadras.map(q => {
      let mods = q.modalidades;
      try { if (typeof mods === 'string') mods = JSON.parse(mods); } catch {}
      if (!Array.isArray(mods)) mods = [];
      return { 
        ...q, 
        preco_base: (q.preco_base || 0) / 100, 
        modalidades: mods.map(m => ({ ...m, preco: (m.preco || 0) / 100 })) 
      };
    });

    const formattedReservas = reservas.map(r => ({
      ...r,
      valor_total: (r.valor_total || 0) / 100,
      valor_pago: (r.valor_pago || 0) / 100
    }));

    res.json({ quadras: formattedQuadras, reservas: formattedReservas, bloqueios });
  } catch (error) {
    logger.error('Erro ao listar grade:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

const criarReserva=async(req,res)=>{
 try {
  const inserted=await require('../services/bookingService').createBookings({tenantId:req.user.tenant_id,items:req.body.itens || [req.body],actor:req.user,source:'staff'});
  const balance=await db.getAsync('SELECT status_pagamento FROM Reservas WHERE id=?',[inserted.reservasCriadasIds[0]]);
  const result={reserva_id:inserted.reservasCriadasIds[0],reservas_ids:inserted.reservasCriadasIds,valor_total:inserted.valorTotalGeral / 100,status_pagamento:balance.status_pagamento};
  logAuditEvent(req.user.id,'Criacao de reserva','Reserva: '+result.reserva_id,req.ip);
  res.status(201).json({message:'Reserva criada.',...result});
 }catch(e){res.status(e.status||500).json({error: require('../utils/security').publicError(e, 'Erro ao criar reserva.')});}
};

const minhasReservas = async (req, res) => {
  try {
    const member = await require('../services/clientAccessService').membership(req.user, req.user.tenant_id, false);
    const cliente_id = member?.id;
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

    res.json(reservas.map(r => ({ ...r, valor_total: (r.valor_total || 0) / 100 })));
  } catch (error) {
    logger.error(error);
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

    // Busca o texto do motivo para o log
    // Busca o texto do motivo para o log
    let motivoTexto = 'Motivo desconhecido';
    if (motivo) {
      if (motivo == -1) motivoTexto = 'Desistência do Cliente';
      else if (motivo == -2) motivoTexto = 'Condições Climáticas';
      else if (motivo == -3) motivoTexto = 'Manutenção da Quadra';
      else {
        const m = await db.getAsync('SELECT motivo FROM MotivosCancelamento WHERE id = ? AND tenant_id = ?', [motivo,tenant_id]);
        if (m) motivoTexto = m.motivo;
      }
    }

    let grupoClause = 'WHERE id = ? AND tenant_id = ?';
    let grupoParams = [id, tenant_id];

    if (reserva.grupo_id && String(reserva.grupo_id).trim() !== '') {
      grupoClause = 'WHERE grupo_id = ? AND tenant_id = ?';
      grupoParams = [reserva.grupo_id, tenant_id];
    }

    const cancellation=await require('../services/bookingCancellationService').requestCancellation([id],{tenantId:tenant_id,reason:motivoTexto});
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
        logger.error('[SMTP] Erro ao disparar e-mail de cancelamento:', e.message);
      }
    })();

    res.status(cancellation.pending?202:200).json({message:cancellation.pending?'Cancelamento pendente de conciliação.':'Reserva cancelada.',pending:cancellation.pending});
  } catch (error) {
    logger.error(error);
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

    res.status(201).json({ message: 'Quadra bloqueada com sucesso.', bloqueio_id: insert.lastID, id: insert.lastID });
  } catch (error) {
    logger.error('Erro ao criar bloqueio:', error);
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
    logger.error('Erro ao remover bloqueio:', error);
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
    logger.error('Erro ao desbloquear parcialmente:', error);
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
    logger.error('Erro ao desbloquear parcialmente via DELETE:', error);
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
