require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.disable('x-powered-by');

const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174', 'http://localhost:5175'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('Origem não permitida pela política de CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));



// Trust proxy é necessário se a API estiver atrás de um Load Balancer (Render, Heroku, etc.)
// Isso garante que o express-rate-limit bloqueie o IP real (RNF-009)
app.set('trust proxy', 1);

// Servir arquivos estáticos do frontend React e Uploads de Mídia
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Rotas API
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/public', require('./routes/publicRoutes'));
app.use('/api/reservas', require('./routes/reservasRoutes'));
app.use('/api/quadras', require('./routes/quadrasRoutes'));
app.use('/api/pagamentos', require('./routes/pagamentosRoutes'));
app.use('/api/pagamentos/gateway', require('./routes/gatewayRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/clientes', require('./routes/clientesRoutes'));
app.use('/api/saas', require('./routes/saasRoutes'));
app.use('/api/tenant/assinatura', require('./routes/tenantAssinaturaRoutes'));
app.use('/api/usuarios', require('./routes/usuariosRoutes'));
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CourtManager API rodando com sucesso.' });
});

module.exports = app;
