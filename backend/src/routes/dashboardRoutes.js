const { requirePermission } = require('../utils/permissions');
const express = require('express');
const router = express.Router();
const { obterResumoDia } = require('../controllers/dashboardController');
const { verifyToken } = require('../middlewares/auth');

router.get('/resumo', verifyToken, requirePermission('staff.read'), obterResumoDia);

module.exports = router;
