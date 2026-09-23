const { requirePermission } = require('../utils/permissions');
const express = require('express');
const router = express.Router();
const { listarQuadras, criarQuadra, atualizarQuadra, alterarStatusQuadra, criarBloqueio, deletarQuadra } = require('../controllers/quadrasController');
const { verifyToken } = require('../middlewares/auth');

// Todas as rotas de quadras exigem token
router.use(verifyToken);

// Listar quadras (Qualquer perfil interno logado)
router.get('/', requirePermission('staff.read'), listarQuadras);

// Apenas Gerentes e Admins podem criar ou modificar quadras
router.post('/', requirePermission('courts.manage'), criarQuadra);
router.put('/:id', requirePermission('courts.manage'), atualizarQuadra);
router.patch('/:id/status', requirePermission('courts.manage'), alterarStatusQuadra);
router.delete('/:id', requirePermission('courts.manage'), deletarQuadra);

// Bloqueios
router.post('/bloqueios', requirePermission('blocks.manage'), criarBloqueio);

module.exports = router;
