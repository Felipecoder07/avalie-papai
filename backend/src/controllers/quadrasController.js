const logger = require('../utils/safeLogger').forModule('quadrasController');
const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');
const { cents } = require('../utils/security');

// Listar quadras filtrando pelo tenant do usuário logado
const listarQuadras = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const quadras = await db.allAsync("SELECT * FROM Quadras WHERE tenant_id = ? AND status != 'Excluida' ORDER BY nome ASC", [tenant_id]);
    
    const formatted = quadras.map(q => {
      let modalidades = [];
      if (q.modalidades) {
        try {
          modalidades = typeof q.modalidades === 'string' ? JSON.parse(q.modalidades) : q.modalidades;
        } catch {
          modalidades = [{ nome: q.tipo || 'Beach Tennis', preco: q.preco_base || 80 }];
        }
      } else if (q.tipo) {
        modalidades = q.tipo === 'Areia' 
          ? [
              { nome: 'Beach Tennis', preco: q.preco_base || 80 },
              { nome: 'Vôlei de Praia', preco: q.preco_base || 80 },
              { nome: 'Futevôlei', preco: q.preco_base || 80 }
            ]
          : [{ nome: q.tipo, preco: q.preco_base || 80 }];
      }

      const normalizedModalidades = (Array.isArray(modalidades) ? modalidades : []).map(m => {
        if (typeof m === 'string') {
          return { nome: m, preco: (q.preco_base != null ? q.preco_base : 8000) / 100 };
        }
        return { nome: m.nome, preco: Number(m.preco != null ? m.preco : q.preco_base || 8000) / 100 };
      });

      return { ...q, preco_base: (q.preco_base != null ? q.preco_base : 8000) / 100, modalidades: normalizedModalidades };
    });

    res.json(formatted);
  } catch (error) {
    logger.error('Erro ao buscar quadras:', error);
    res.status(500).json({ error: 'Erro ao buscar quadras.' });
  }
};

// Criar nova quadra
const criarQuadra = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const { nome, tipo, modalidades, preco_base, hora_abertura, hora_fechamento } = req.body;

    if (!nome || !tipo) {
      return res.status(400).json({ error: 'Nome e tipo de quadra são obrigatórios.' });
    }

    // Validar limite de quadras do plano SaaS da arena
    const arenaPlano = await db.getAsync(`
      SELECT p.nome, p.max_quadras 
      FROM Arenas a
      LEFT JOIN PlanosSaaS p ON a.plano_id = p.id
      WHERE a.id = ?
    `, [tenant_id]);

    if (arenaPlano && arenaPlano.max_quadras) {
      const quadrasCount = await db.getAsync(
        "SELECT COUNT(*) as total FROM Quadras WHERE tenant_id = ? AND status != 'Excluida'",
        [tenant_id]
      );
      if (quadrasCount && quadrasCount.total >= arenaPlano.max_quadras) {
        return res.status(403).json({
          error: `Limite de quadras atingido para o plano ${arenaPlano.nome} (máximo ${arenaPlano.max_quadras} quadras). Faça upgrade do seu plano para cadastrar mais quadras.`,
          code: 'PLAN_LIMIT_REACHED',
          limite: arenaPlano.max_quadras,
          atual: quadrasCount.total
        });
      }
    }

    const basePrice = preco_base != null ? cents(preco_base) : 8000;

    let modalList = [];
    if (Array.isArray(modalidades) && modalidades.length > 0) {
      modalList = modalidades.map(m => {
        if (typeof m === 'string') return { nome: m, preco: basePrice };
        return { nome: m.nome, preco: m.preco != null ? cents(m.preco) : basePrice };
      });
    } else {
      modalList = tipo === 'Areia'
        ? [
            { nome: 'Beach Tennis', preco: basePrice },
            { nome: 'Vôlei de Praia', preco: basePrice },
            { nome: 'Futevôlei', preco: basePrice }
          ]
        : [{ nome: tipo, preco: basePrice }];
    }

    const modalJson = JSON.stringify(modalList);

    const insert = await db.runAsync(
      `INSERT INTO Quadras (tenant_id, nome, tipo, modalidades, preco_base, hora_abertura, hora_fechamento, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Ativa')`,
      [
        tenant_id, 
        nome, 
        tipo, 
        modalJson,
        basePrice, 
        hora_abertura || '07:00', 
        hora_fechamento || '22:00'
      ]
    );

    logAuditEvent(req.user.id, 'Criação de Quadra', `Criou a quadra "${nome}" (${tipo})`, req.ip);

    res.status(201).json({ 
      id: insert.lastID, 
      nome, 
      tipo, 
      modalidades: modalList,
      preco_base: basePrice, 
      hora_abertura,
      hora_fechamento,
      status: 'Ativa' 
    });
  } catch (error) {
    logger.error('Erro ao criar quadra:', error);
    res.status(500).json({ error: 'Erro ao criar quadra.' });
  }
};

// Atualizar quadra
const atualizarQuadra = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const quadraId = req.params.id;
    const { nome, tipo, modalidades, preco_base, hora_abertura, hora_fechamento, status } = req.body;

    // Verificar se a quadra existe e pertence ao tenant
    const quadra = await db.getAsync('SELECT id FROM Quadras WHERE id = ? AND tenant_id = ?', [quadraId, tenant_id]);
    if (!quadra) {
      return res.status(404).json({ error: 'Quadra não encontrada.' });
    }

    const basePrice = preco_base != null ? cents(preco_base) : 8000;

    let modalList = [];
    if (Array.isArray(modalidades) && modalidades.length > 0) {
      modalList = modalidades.map(m => {
        if (typeof m === 'string') return { nome: m, preco: basePrice };
        return { nome: m.nome, preco: m.preco != null ? cents(m.preco) : basePrice };
      });
    } else {
      modalList = tipo === 'Areia'
        ? [
            { nome: 'Beach Tennis', preco: basePrice },
            { nome: 'Vôlei de Praia', preco: basePrice },
            { nome: 'Futevôlei', preco: basePrice }
          ]
        : [{ nome: tipo || 'Beach Tennis', preco: basePrice }];
    }

    const modalJson = JSON.stringify(modalList);

    await db.runAsync(
      `UPDATE Quadras 
       SET nome = ?, tipo = ?, modalidades = ?, preco_base = ?, hora_abertura = ?, hora_fechamento = ?, status = ?
       WHERE id = ?`,
      [nome, tipo, modalJson, basePrice, hora_abertura, hora_fechamento, status, quadraId]
    );

    logAuditEvent(req.user.id, 'Edição de Quadra', `Atualizou a quadra "${nome}" (ID ${quadraId})`, req.ip);

    res.json({ message: 'Quadra atualizada com sucesso.' });
  } catch (error) {
    logger.error('Erro ao atualizar quadra:', error);
    res.status(500).json({ error: 'Erro ao atualizar quadra.' });
  }
};

// Alternar status da quadra (Ativar/Desativar em vez de excluir)
const alterarStatusQuadra = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const quadraId = req.params.id;
    const { status } = req.body;

    const quadra = await db.getAsync('SELECT id, nome, status FROM Quadras WHERE id = ? AND tenant_id = ?', [quadraId, tenant_id]);
    if (!quadra) {
      return res.status(404).json({ error: 'Quadra não encontrada.' });
    }

    if (status === 'Ativa' && quadra.status !== 'Ativa') {
      const arenaPlano = await db.getAsync(`
        SELECT p.nome, p.max_quadras 
        FROM Arenas a
        LEFT JOIN PlanosSaaS p ON a.plano_id = p.id
        WHERE a.id = ?
      `, [tenant_id]);

      if (arenaPlano && arenaPlano.max_quadras) {
        const ativasCount = await db.getAsync(
          "SELECT COUNT(*) as total FROM Quadras WHERE tenant_id = ? AND status = 'Ativa'",
          [tenant_id]
        );
        if (ativasCount && ativasCount.total >= arenaPlano.max_quadras) {
          return res.status(403).json({
            error: `Não é possível reativar. Limite de ${arenaPlano.max_quadras} quadras ativas já foi atingido no plano ${arenaPlano.nome}.`,
            code: 'PLAN_LIMIT_REACHED'
          });
        }
      }
    }

    await db.runAsync('UPDATE Quadras SET status = ? WHERE id = ?', [status, quadraId]);
    logAuditEvent(req.user.id, 'Status de Quadra', `Alterou o status da quadra "${quadra.nome || quadraId}" para ${status}`, req.ip);
    res.json({ message: `Quadra marcada como ${status}` });
  } catch (error) {
    logger.error('Erro ao alterar status:', error);
    res.status(500).json({ error: 'Erro interno ao alterar status.' });
  }
};

// Criar Bloqueio
const criarBloqueio = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const { quadra_id, data_bloqueio, hora_inicio, hora_fim, motivo } = req.body;

    // TODO: checar se quadra pertence ao tenant

    const insert = await db.runAsync(`
      INSERT INTO Bloqueios (quadra_id, data_bloqueio, hora_inicio, hora_fim, motivo, criado_por)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [quadra_id, data_bloqueio, hora_inicio, hora_fim, motivo, req.user.id]);

    logAuditEvent(req.user.id, 'Criação de bloqueio', `Bloqueou a quadra ID ${quadra_id} no dia ${data_bloqueio} (${hora_inicio} às ${hora_fim})`, req.ip);

    res.status(201).json({ message: 'Bloqueio criado com sucesso', id: insert.lastID });
  } catch (error) {
    logger.error('Erro ao criar bloqueio:', error);
    res.status(500).json({ error: 'Erro interno ao criar bloqueio.' });
  }
};

// Excluir Quadra (Soft Delete Híbrido)
const deletarQuadra = async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const quadraId = req.params.id;

    const quadra = await db.getAsync('SELECT id, nome FROM Quadras WHERE id = ? AND tenant_id = ?', [quadraId, tenant_id]);
    if (!quadra) {
      return res.status(404).json({ error: 'Quadra não encontrada.' });
    }

    // Verifica se há histórico de reservas vinculadas
    const reservas = await db.getAsync('SELECT COUNT(*) as count FROM Reservas WHERE quadra_id = ?', [quadraId]);
    if (reservas && reservas.count > 0) {
      // Soft Delete: Marca como 'Excluida' para manter a integridade dos relatórios passados
      await db.runAsync("UPDATE Quadras SET status = 'Excluida' WHERE id = ?", [quadraId]);
      logAuditEvent(req.user.id, 'Exclusão de Quadra', `Arquivou a quadra "${quadra.nome}" (ID ${quadraId}) preservando ${reservas.count} reservas`, req.ip);
      return res.json({ 
        message: `Quadra "${quadra.nome}" arquivada com sucesso! O histórico de ${reservas.count} reservas foi preservado nos relatórios.`,
        action: 'soft_deleted',
        reservas_preservadas: reservas.count
      });
    }

    // Sem histórico: Exclusão física definitiva
    await db.runAsync('DELETE FROM Quadras WHERE id = ?', [quadraId]);
    logAuditEvent(req.user.id, 'Exclusão de Quadra', `Excluiu definitivamente a quadra "${quadra.nome}" (ID ${quadraId})`, req.ip);
    res.json({ 
      message: `Quadra "${quadra.nome}" excluída definitivamente.`,
      action: 'hard_deleted'
    });
  } catch (error) {
    logger.error('Erro ao excluir quadra:', error);
    res.status(500).json({ error: 'Erro interno ao excluir quadra.' });
  }
};

module.exports = { listarQuadras, criarQuadra, atualizarQuadra, alterarStatusQuadra, criarBloqueio, deletarQuadra };
