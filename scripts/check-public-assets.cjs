const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const findings = [];
// Compare literal configured server credentials without printing their values.
// This is an additional check, not proof against all encoded/obfuscated leaks.
const dotenv = require('../backend/node_modules/dotenv');
const envFile = path.join(root, 'backend/.env');
const secrets = Object.entries(fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {})
  .filter(([key, value]) => /SECRET|TOKEN|PASS|KEYRING/.test(key) && value.length >= 12);
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(root, full);
    if (entry.isSymbolicLink() || entry.name.startsWith('.') ||
        /\.(?:env|sqlite3?|db|sql|bak|backup|map)(?:-(?:wal|shm))?$/i.test(entry.name) ||
        /^(?:node_modules|backups|data|backend|package(?:-lock)?\.json)$/i.test(entry.name)) {
      findings.push(relative);
    } else if (entry.isDirectory()) inspect(full);
    else if (/\.(?:js|css|html|json)$/i.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf8');
      for (const [key, value] of secrets) if (content.includes(value)) findings.push(relative + ': credencial ' + key);
    }
  }
}
for (const project of ['frontend', 'tela cliente']) {
  const directory = path.join(root, project, 'dist');
  if (!fs.existsSync(path.join(directory, 'index.html'))) findings.push(project + ': build ausente');
  else inspect(directory);
}
if (findings.length) {
  console.error('Publicacao bloqueada por arquivos inesperados:', JSON.stringify(findings));
  process.exitCode = 1;
} else console.log('Artefatos aprovados: sem arquivos proibidos nem credenciais literais do backend .env. O deploy ainda exige verificacao.');
