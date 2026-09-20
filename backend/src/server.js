const path = require("node:path");
const fs = require("node:fs");
require('dotenv').config();
require('./utils/security').validateEnvironment();
const app = require('./app');
const initDb = require('./config/init_db');

// Servidor Node.js do Backend Arenix SaaS - Automatic OAuth Exchange

// Inicializa o banco de dados (Criação de tabelas)
initDb();

const { startSaaSCron } = require('./jobs/cronSaaS');
const { validateEnvironment } = require('./config/envValidation');
startSaaSCron();

const PORT = process.env.PORT || 3000;

// Validação Fail-fast de ambiente antes de inicializar o servidor
validateEnvironment();

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


