const { requirePermission } = require('../utils/permissions');
const express = require('express');
const router = express.Router();
const { listarLogs } = require('../controllers/auditoriaController');
const { verifyToken } = require('../middlewares/auth');

router.get('/', verifyToken, requirePermission('audit.read'), listarLogs);

module.exports = router;
