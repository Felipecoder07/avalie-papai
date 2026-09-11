const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');

const defaultMotivos = [
  { id: -1, motivo: 'Desistência do Cliente' },
  { id: -2, motivo: 'Condições Climáticas' },
  { id: -3, motivo: 'Manutenção da Quadra' }
];

const listarMotivos = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const motivos = await db.allAsync(`SELECT * FROM MotivosCancelamento WHERE tenant_id = ? ORDER BY id ASC`, [tenant_id]);
    res.json([...defaultMotivos, ...motivos]);
  } catch (error) {
    console.error('Erro ao buscar motivos de cancelamento:', error);
    res.status(500).json({ error: 'Erro ao buscar motivos de cancelamento.' });
  }
};

const criarMotivo = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const admin_id = req.user.id;
  const ip = req.headers['x-forwarded-for'] || req.ip;
  const { motivo } = req.body;

  if (!motivo) {
    return res.status(400).json({ error: 'O nome do motivo é obrigatório.' });
  }

  try {
    const result = await db.runAsync(
      `INSERT INTO MotivosCancelamento (tenant_id, motivo) VALUES (?, ?)`,
      [tenant_id, motivo]
    );

    logAuditEvent(admin_id, 'Criação de Motivo', `Adicionou o motivo de cancelamento ID ${result.lastID}`, ip);
    res.status(201).json({ id: result.lastID, motivo });
  } catch (error) {
    console.error('Erro ao criar motivo de cancelamento:', error);
    res.status(500).json({ error: 'Erro ao criar motivo de cancelamento.' });
  }
};

const excluirMotivo = async (req, res) => {
  const { id } = req.params;
  const tenant_id = req.user.tenant_id;
  const admin_id = req.user.id;
  const ip = req.headers['x-forwarded-for'] || req.ip;

  try {
    if (Number.parseInt(id) < 0) {
      return res.status(403).json({ error: 'Não é possível excluir os motivos predefinidos do sistema.' });
    }

    const result = await db.runAsync(`DELETE FROM MotivosCancelamento WHERE id = ? AND tenant_id = ?`, [id, tenant_id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Motivo não encontrado.' });
    }

    logAuditEvent(admin_id, 'Exclusão de Motivo', `Removeu o motivo de cancelamento ID ${id}`, ip);
    res.json({ message: 'Motivo de cancelamento excluído com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir motivo de cancelamento:', error);
    res.status(500).json({ error: 'Erro ao excluir motivo de cancelamento.' });
  }
};

module.exports = {
  listarMotivos,
  criarMotivo,
  excluirMotivo
};
