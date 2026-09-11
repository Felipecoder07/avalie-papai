const path = require("node:path");
const fs = require("node:fs");
const app = require('./app');
const initDb = require('./config/init_db');

// Servidor Node.js do Backend Arenix SaaS - Automatic OAuth Exchange
const PORT = process.env.PORT || 3000;

// Inicializa o banco de dados (Criação de tabelas)
initDb();

const { startSaaSCron } = require('./jobs/cronSaaS');
startSaaSCron();

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const quadrasRoutes = require('./routes/quadrasRoutes');
const reservasRoutes = require('./routes/reservasRoutes');
const clientesRoutes = require('./routes/clientesRoutes');
const pagamentosRoutes = require('./routes/pagamentosRoutes');
const auditoriaRoutes = require('./routes/auditoriaRoutes');
const relatoriosRoutes = require('./routes/relatoriosRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const arenasRoutes = require('./routes/arenasRoutes');
const motivosRoutes = require('./routes/motivosRoutes');

const tenantAssinaturaRoutes = require('./routes/tenantAssinaturaRoutes');
const publicRoutes = require('./routes/publicRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/quadras', quadrasRoutes);
app.use('/api/reservas', reservasRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/arenas', arenasRoutes);
app.use('/api/motivos', motivosRoutes);
app.use('/api/tenant/assinatura', tenantAssinaturaRoutes);

// SPA Fallback - redireciona qualquer rota de página para o index.html do React
app.use((req, res, next) => {
  if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    const indexPath = path.resolve(__dirname, '../../frontend/dist/index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  next();
});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor iniciado na porta ${PORT} (0.0.0.0)`);
});


