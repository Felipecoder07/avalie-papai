const { requirePermission } = require('../utils/permissions');
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const motivosController = require('../controllers/motivosController');

router.use(verifyToken);

// Qualquer usuário logado pode listar os motivos
router.get('/', requirePermission('staff.read'), motivosController.listarMotivos);

// Apenas Administrador pode criar ou excluir motivos (pode ser ajustado se Gerente puder)
router.post('/', requirePermission('reasons.manage'), motivosController.criarMotivo);
router.delete('/:id', requirePermission('reasons.manage'), motivosController.excluirMotivo);

module.exports = router;
