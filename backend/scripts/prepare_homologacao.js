// Copies code only. Never copies an existing database, uploads or production secrets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '../..');
const target = path.join(root, '.local-security/homologacao/instance');
if (fs.existsSync(target)) throw new Error('Instance already exists; preserved without overwriting.');
const test = dotenv.parse(fs.readFileSync(path.join(root, 'backend/.env.homologacao')));
if (!test.MERCADO_PAGO_ACCESS_TOKEN?.startsWith('TEST-')) throw new Error('TEST credential required.');
const current = dotenv.parse(fs.readFileSync(path.join(root, 'backend/.env')));
fs.mkdirSync(path.join(target, 'backend'), { recursive: true });
fs.cpSync(path.join(root, 'backend/src'), path.join(target, 'backend/src'), { recursive: true });
const random = () => crypto.randomBytes(32).toString('hex');
const config = {
  NODE_ENV: 'development', PORT: '3100', LISTEN_HOST: '127.0.0.1',
  FRONTEND_URL: 'http://localhost:5183',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5183,http://localhost:5186,http://127.0.0.1:3100',
  JWT_SECRET: random(), SECRETS_KEYRING: JSON.stringify({ homologacao: random() }),
  SECRETS_ACTIVE_KEY_ID: 'homologacao',
  GOOGLE_CLIENT_ID: current.GOOGLE_CLIENT_ID || '',
  MERCADO_PAGO_PUBLIC_KEY: test.MERCADO_PAGO_PUBLIC_KEY,
  MERCADO_PAGO_ACCESS_TOKEN: test.MERCADO_PAGO_ACCESS_TOKEN,
  APP_TIMEZONE: 'America/Sao_Paulo',
};
fs.writeFileSync(path.join(target, 'config.json'), JSON.stringify(config, null, 2));
fs.writeFileSync(path.join(target, 'login.json'), JSON.stringify({ email: 'admin@homologacao.example.test', password: random() }, null, 2));
const hashes = {};
function inventory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) inventory(file);
    else hashes[path.relative(path.join(target, 'backend/src'), file)] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
}
inventory(path.join(target, 'backend/src'));
fs.writeFileSync(path.join(target, 'source-manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), hashes }, null, 2));
console.log('Isolated source snapshot prepared. Fresh database will be initialized by run_homologacao.js.');
console.log('SMTP, OAuth client secret, old database, uploads and production keyring were not copied.');
