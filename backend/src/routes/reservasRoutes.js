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
const { verifyToken, requireRole } = require('../middlewares/auth');

router.get('/grade', verifyToken, requireRole(['Administrador', 'Gerente', 'Recepcionista']), listarGrade);
router.post('/', verifyToken, requireRole(['Administrador', 'Gerente', 'Recepcionista']), criarReserva);
router.post('/bloqueios', verifyToken, requireRole(['Administrador', 'Gerente']), criarBloqueio);
router.delete('/bloqueios/:id', verifyToken, requireRole(['Administrador', 'Gerente']), removerBloqueio);
router.delete('/bloqueios/:id/horario', verifyToken, requireRole(['Administrador', 'Gerente']), desbloquearHoraDelete);
router.patch('/bloqueios/:id/desbloquear-hora', verifyToken, requireRole(['Administrador', 'Gerente']), desbloquearParcialmente);

// Listar reservas do cliente logado (Issue 2)
router.get('/minhas', verifyToken, requireRole(['Cliente']), minhasReservas);

router.patch('/:id/cancelar', verifyToken, requireRole(['Administrador', 'Gerente', 'Recepcionista']), cancelarReserva);

module.exports = router;
