const path = require("node:path");
const fs = require("node:fs");
require('dotenv').config();
require('./config/envValidation').validateEnvironment();
if (process.env.NODE_ENV === 'production') process.umask(0o077);
const app = require('./app');
const initDb = require('./config/init_db');

// Servidor Node.js do Backend Arenix SaaS - Automatic OAuth Exchange

// Inicializa o banco de dados (Criação de tabelas)
initDb();

const { startSaaSCron } = require('./jobs/cronSaaS');
startSaaSCron();

const PORT = process.env.PORT || 3000;


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


const HOST = process.env.LISTEN_HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
app.listen(PORT, HOST, () => {
  console.log(`Servidor iniciado na porta ${PORT} (${HOST})`);
});
