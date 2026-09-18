const express = require('express');
const router = express.Router();
const { login, logout, register, forgotPassword, resetPassword } = require('../controllers/authController');
const { loginLimiter, recoveryLimiter } = require('../middlewares/rateLimiter');
const { verifyToken } = require('../middlewares/auth');
const db = require('../config/database');

router.post('/login', loginLimiter, login);
router.post('/register', recoveryLimiter, register);
router.post('/logout', verifyToken, logout);
router.post('/forgot-password', recoveryLimiter, forgotPassword);
router.post('/reset-password', recoveryLimiter, resetPassword);

// Rota pública para obter planos na Landing Page
router.get('/planos', async (req, res) => {
  try {
    const planos = await db.allAsync('SELECT * FROM PlanosSaaS ORDER BY valor_mensal ASC');
    res.json(planos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar planos públicos.' });
  }
});

// Rota pública para verificar estado de manutenção do sistema
router.get('/manutencao', async (req, res) => {
  try {
    const config = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'manutencao_ativa'");
    const msg = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'manutencao_mensagem'");
    res.json({
      ativa: config && config.valor === '1',
      mensagem: msg ? msg.valor : 'Estamos em manutenção programada. Voltamos em instantes.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar estado de manutenção.' });
  }
});

// Rota para obter detalhes do usuário logado (Validação segura de sessão)
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await db.getAsync(`
      SELECT u.id, u.nome, u.email, u.perfil, u.tenant_id, u.cliente_id, a.nome as arena_nome, a.slug as arena_slug
      FROM Usuarios u
      LEFT JOIN Arenas a ON u.tenant_id = a.id
      WHERE u.id = ?
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.json({
      autenticado: true,
      usuario: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        perfil: user.perfil,
        tenant_id: user.tenant_id,
        cliente_id: user.cliente_id,
        arena_nome: user.arena_nome,
        arena_slug: user.arena_slug
      }
    });
  } catch (err) {
    console.error('Erro no endpoint /me:', err);
    res.status(500).json({ error: 'Erro interno ao validar sessão.' });
  }
});

// Rota para obter comunicados ativos da arena logada
router.get('/comunicados/ativos', verifyToken, async (req, res) => {
  const tenantId = req.user.tenant_id;
  try {
    const query = `
      SELECT id, mensagem as message, canal as channel, criado_em as createdAt
      FROM ComunicadosSaaS
      WHERE (destino = 'all' OR destino = ?)
        AND ativo = 1
        AND expira_em > datetime('now')
      ORDER BY criado_em DESC
    `;
    const rows = await db.allAsync(query, [String(tenantId || '')]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar comunicados ativos.' });
  }
});

router.post('/mfa/setup', verifyToken, recoveryLimiter, require('../middlewares/mfa').setup);
router.post('/mfa/confirm', verifyToken, recoveryLimiter, require('../middlewares/mfa').confirm);
module.exports = router;
