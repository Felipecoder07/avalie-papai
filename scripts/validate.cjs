const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;
if (!npmCli || !fs.existsSync(npmCli)) {
  console.error('Execute pela raiz: npm run validate (npm.cmd run validate no PowerShell).');
  process.exit(1);
}

const startedAt = new Date().toISOString();
const reportDir = path.join(root, 'artifacts', 'homologacao', startedAt.replace(/[:.]/g, '-'));
fs.mkdirSync(reportDir, { recursive: true });
const steps = [
  ['backend-tests', 'backend', 'test'],
  ['frontend-tests', 'frontend', 'test'],
  ['cliente-tests', 'tela cliente', 'test'],
  ['frontend-types', 'frontend', 'typecheck'],
  ['cliente-types', 'tela cliente', 'typecheck'],
  ['frontend-build', 'frontend', 'build'],
  ['cliente-build', 'tela cliente', 'build'],
  ['frontend-lint', 'frontend', 'lint'],
  ['cliente-lint', 'tela cliente', 'lint']
];
let commit = 'indisponivel';
let dirty = null;
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0;
} catch { /* Permite executar também em pacote sem metadados Git. */ }

const report = { startedAt, commit, dirty, node: process.version, results: [], automatedPassed: false, productionApproved: false };
const summaryPath = path.join(reportDir, 'summary.json');
const saveReport = () => fs.writeFileSync(summaryPath, JSON.stringify(report, null, 2) + '\n');
saveReport();

for (const [name, project, script] of steps) {
  console.log(`Executando ${name}...`);
  const start = Date.now();
  const log = path.join(reportDir, `${name}.log`);
  const fd = fs.openSync(log, 'w');
  let result;
  try {
    result = spawnSync(process.execPath, [npmCli, 'run', script, '--prefix', project], {
      cwd: root,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        ...(script === 'test' ? { NODE_ENV: 'test', EMAIL_USER: '', EMAIL_PASS: '' } : {})
      },
      stdio: ['ignore', fd, fd],
      timeout: 10 * 60 * 1000,
      windowsHide: true
    });
  } finally {
    fs.closeSync(fd);
  }
  const passed = !result.error && result.status === 0;
  const record = { name, passed, exitCode: result.status, durationMs: Date.now() - start, log: path.basename(log) };
  if (result.error) record.error = result.error.message;
  report.results.push(record);
  saveReport();
  console.log(`${passed ? 'PASSOU' : 'FALHOU'}: ${name} (${Math.round(record.durationMs / 1000)}s)`);
}
report.finishedAt = new Date().toISOString();
report.automatedPassed = report.results.every(result => result.passed);
saveReport();
console.log(`Relatório: ${summaryPath}`);
console.log('A aprovação para produção também exige as evidências de docs/HOMOLOGACAO.md.');
process.exitCode = report.automatedPassed ? 0 : 1;
