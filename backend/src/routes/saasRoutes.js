const express = require('express');
const router = express.Router();
const saasController = require('../controllers/saasController');
const { verifyToken, verifySuperAdmin } = require('../middlewares/auth');

// Webhook público do Mercado Pago para mensalidades do SaaS (sem autenticação JWT)
router.post('/webhook-pagamento', saasController.handleSaaSWebhook);

router.use(verifyToken);
router.use(verifySuperAdmin);
router.use(require('../middlewares/mfa').requireMasterMfa);

router.get('/arenas', saasController.getArenas);
router.post('/arenas', saasController.createArena);
router.get('/arenas/:id', saasController.getArenaById);
router.put('/arenas/:id', saasController.updateArena);
router.delete('/arenas/:id', saasController.deleteArena);
router.patch('/arenas/:id/status', saasController.toggleArenaStatus);

router.get('/planos', saasController.getPlanosSaaS);
router.put('/planos/:id', saasController.updatePlanoSaaS);
router.patch('/arenas/:id/plano', saasController.updateArenaPlan);
router.get('/arenas/:id/faturas', saasController.getFaturasSaaS);
router.post('/faturas/:id/pagar', saasController.payFaturaSaaS);

router.get('/metrics', saasController.getMetrics);

router.get('/faturas', saasController.getAllFaturasSaaS);
router.get('/auditoria', saasController.getAuditoriaMaster);
router.get('/sessoes', saasController.getActiveSessions);
router.post('/alterar-senha', saasController.changeMasterPassword);

router.get('/usuarios', saasController.getUsuariosSaaS);
router.patch('/usuarios/:id/status', saasController.toggleUsuarioStatus);
router.post('/usuarios/:id/reset-senha', saasController.resetUsuarioPassword);
router.get('/usuarios/:id/acessos', saasController.getUsuarioAcessos);

router.get('/comunicados', saasController.getComunicadosSaaS);
router.post('/comunicados', saasController.createComunicadoSaaS);
router.delete('/comunicados/:id', saasController.deleteComunicadoSaaS);

router.get('/configuracoes', saasController.getConfiguracoesSaaS);
router.put('/configuracoes', saasController.updateConfiguracoesSaaS);
router.post('/executar-bloqueio-inadimplencia', saasController.triggerAutoBlockCron);

module.exports = router;
