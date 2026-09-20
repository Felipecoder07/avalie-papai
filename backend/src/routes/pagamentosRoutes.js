const { requirePermission } = require('../utils/permissions');
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const { registrarPagamento, aplicarDesconto, registrarEstorno, resumoPagamentos, listarReservasPagamentos } = require('../controllers/pagamentosController');
const db = require('../config/database');

// KPIs financeiros do dia/mês
router.get('/resumo', verifyToken, requirePermission('payments.read'), resumoPagamentos);

// Listagem de reservas com dados de pagamento
router.get('/reservas', verifyToken, requirePermission('payments.read'), listarReservasPagamentos);

// Listar pagamentos de uma reserva específica (com validação multi-tenant)
router.get('/reserva/:reserva_id', verifyToken, requirePermission('payments.read'), async (req, res) => {
  try {
    const pags = await db.allAsync(`
      SELECT p.* FROM Pagamentos p
      JOIN Reservas r ON p.reserva_id = r.id
      WHERE p.reserva_id = ? AND r.tenant_id = ?
      ORDER BY p.registrado_em ASC
    `, [req.params.reserva_id, req.user.tenant_id]);
    res.json(pags);
  } catch(e) { 
    res.status(500).json({ error: 'Erro ao listar pagamentos.' }); 
  }
});

// Registrar novo pagamento
router.post('/', verifyToken, requirePermission('payments.manual'), registrarPagamento);

// Aplicar desconto (RN-007: Apenas Gerente ou Admin)
router.post('/desconto', verifyToken, requirePermission('payments.discount'), aplicarDesconto);

// Estornar pagamento (RN-008: Apenas Admin)
router.post('/estorno', verifyToken, requirePermission('payments.refund'), registrarEstorno);

module.exports = router;
