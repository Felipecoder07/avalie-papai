require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require("node:path");

const app = express();
require('./config/proxy').configureProxy(app);
app.use(require('./middlewares/publicFiles').protectPublicFiles);
const helmet = require('helmet');
const { globalLimiter } = require('./middlewares/rateLimiter');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://accounts.google.com', 'https://sdk.mercadopago.com'], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'https:'], connectSrc: ["'self'", 'https://accounts.google.com', 'https://api.mercadopago.com'], frameSrc: ['https://accounts.google.com', 'https://www.mercadopago.com.br'], frameAncestors: ["'none'"] } }, strictTransportSecurity: process.env.NODE_ENV === 'production' && process.env.ENABLE_HSTS === 'true' ? { maxAge: 31536000, includeSubDomains: false } : false }));
app.use('/api', globalLimiter);
app.disable('x-powered-by');

const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origem não permitida pela política de CORS'));
  },
  credentials: true
}));
const { uploadLimiter } = require('./middlewares/rateLimiter');
app.use('/api/arenas/upload-capa', uploadLimiter, express.json({limit:'7mb'}));
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ limit: '32kb', extended: false }));
app.use((req,res,next)=>{
 if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && !allowedOrigins.includes(req.headers.origin)) return res.status(403).json({error:'Origem nao permitida.'});
 next();
});



// Trust proxy é necessário se a API estiver atrás de um Load Balancer (Render, Heroku, etc.)
// Isso garante que o express-rate-limit bloqueie o IP real (RNF-009)

// Servir arquivos estáticos do frontend React e Uploads de Mídia
const fs = require("node:fs");
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', (req,res,next)=>{ if(!/^\/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/.test(req.path)) return res.sendStatus(404); res.set('Content-Security-Policy', "default-src 'none'; sandbox"); next(); }, express.static(uploadsDir, {dotfiles:'deny',index:false}));
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
app.use('/api/arenas', require('./routes/arenasRoutes'));
app.use('/api/auditoria', require('./routes/auditoriaRoutes'));
app.use('/api/relatorios', require('./routes/relatoriosRoutes'));
app.use('/api/motivos', require('./routes/motivosRoutes'));
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CourtManager API rodando com sucesso.' });
});

app.use((err,req,res,next)=>{ if(res.headersSent) return next(err); res.status(err.status || 500).json({error:err.status && err.status<500 ? 'Requisicao invalida.' : 'Erro interno.'}); });
module.exports = app;
