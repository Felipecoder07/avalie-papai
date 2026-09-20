const { requirePermission } = require('../utils/permissions');
const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { verifyToken } = require('../middlewares/auth');

// Rotas restritas para Administrador
router.use(verifyToken);
router.use(requirePermission('users.manage'));

router.post('/transferir-administracao', requirePermission('owner.transfer'), require('../middlewares/rateLimiter').recoveryLimiter, require('../controllers/ownershipController').transfer);

router.get('/', usuariosController.listarUsuarios);
router.post('/', usuariosController.criarUsuario);
router.put('/:id', usuariosController.editarUsuario);
router.delete('/:id', usuariosController.excluirUsuario);

module.exports = router;
