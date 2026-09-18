const express = require('express');
const router = express.Router();
const { listarClientes, criarCliente, obterCliente, atualizarCliente, excluirCliente, arquivarCliente, desarquivarCliente } = require('../controllers/clientesController');
const { verifyToken, requireRole } = require('../middlewares/auth');

router.use(verifyToken);
router.use(requireRole(require('../utils/permissions').staff));
router.get('/', listarClientes);
router.post('/', criarCliente);
router.get('/:id', obterCliente);
router.put('/:id', atualizarCliente);
router.delete('/:id', excluirCliente);
router.patch('/:id/arquivar', arquivarCliente);
router.patch('/:id/desarquivar', desarquivarCliente);

module.exports = router;
