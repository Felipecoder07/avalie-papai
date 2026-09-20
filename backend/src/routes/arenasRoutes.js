const { requirePermission } = require('../utils/permissions');
const express = require('express');
const router = express.Router();
const arenasController = require('../controllers/arenasController');
const { verifyToken } = require('../middlewares/auth');

// Rotas restritas para Administrador
router.use(verifyToken);
router.use(requirePermission('arena.manage'));

router.get('/minha', arenasController.getMinhaArena);
router.put('/minha', arenasController.atualizarMinhaArena);
router.post('/upload-capa', arenasController.uploadFotoCapa);

module.exports = router;
