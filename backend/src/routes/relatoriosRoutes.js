const { requirePermission } = require('../utils/permissions');
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const { relatorioFaturamento, relatorioOcupacao, relatorioReservas, relatorioInadimplencia, relatorioCancelamentos, relatorioFormasPagamento, relatorioHorariosPico, relatorioTopClientes } = require('../controllers/relatoriosController');

// Somente Administrador e Gerente podem acessar relatórios
router.use(verifyToken, requirePermission('reports.read'));

router.get('/faturamento',       relatorioFaturamento);
router.get('/ocupacao',          relatorioOcupacao);
router.get('/reservas',          relatorioReservas);
router.get('/inadimplencia',     relatorioInadimplencia);
router.get('/cancelamentos',     relatorioCancelamentos);
router.get('/formas-pagamento',  relatorioFormasPagamento);
router.get('/horarios-pico',     relatorioHorariosPico);
router.get('/top-clientes',      relatorioTopClientes);

module.exports = router;
