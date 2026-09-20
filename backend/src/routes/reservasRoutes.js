const { requirePermission } = require('../utils/permissions');
const express = require('express');
const router = express.Router();
const { 
  listarGrade, 
  criarReserva, 
  minhasReservas, 
  cancelarReserva, 
  criarBloqueio, 
  removerBloqueio, 
  desbloquearParcialmente,
  desbloquearHoraDelete
} = require('../controllers/reservasController');
const { verifyToken } = require('../middlewares/auth');

router.get('/grade', verifyToken, requirePermission('reservations.manage'), listarGrade);
router.post('/', verifyToken, requirePermission('reservations.manage'), criarReserva);
router.post('/bloqueios', verifyToken, requirePermission('blocks.manage'), criarBloqueio);
router.delete('/bloqueios/:id', verifyToken, requirePermission('blocks.manage'), removerBloqueio);
router.delete('/bloqueios/:id/horario', verifyToken, requirePermission('blocks.manage'), desbloquearHoraDelete);
router.patch('/bloqueios/:id/desbloquear-hora', verifyToken, requirePermission('blocks.manage'), desbloquearParcialmente);

// Listar reservas do cliente logado (Issue 2)
router.get('/minhas', verifyToken, requirePermission('athlete.self'), minhasReservas);

router.patch('/:id/cancelar', verifyToken, requirePermission('reservations.manage'), cancelarReserva);

module.exports = router;
