const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const folder = path.join(root, '.local-security/homologacao');
const config = JSON.parse(fs.readFileSync(path.join(folder, 'instance/config.json')));
const login = JSON.parse(fs.readFileSync(path.join(folder, 'instance/login.json')));
const base = 'http://127.0.0.1:3100';
async function main() {
  const report = { at: new Date().toISOString(), results: {}, externalHomologationApproved: false };
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  const session = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: login.email, senha: login.password }) });
  assert.equal(session.status, 200);
  const identity = await session.json();
  assert.equal(identity.usuario?.tenant_id ?? identity.tenant_id, 1);
  const cookies = session.headers.getSetCookie().map(value => value.split(';')[0]);
  const headers = { 'Content-Type': 'application/json', Cookie: cookies.join('; '), 'x-csrf-token': cookies.find(v => v.startsWith('cm_csrf=')).slice('cm_csrf='.length) };
  report.results.localLogin = 'passed';
  const connect = await fetch(base + '/api/pagamentos/gateway/maquineta', { method: 'POST', headers, body: JSON.stringify({ gateway_access_token: config.MERCADO_PAGO_ACCESS_TOKEN, gateway_public_key: config.MERCADO_PAGO_PUBLIC_KEY }) });
  report.results.manualTestCredentialConnectionHttpStatus = connect.status;
  // This is the manual credential route, not proof of OAuth authorization.
  if (connect.ok && process.argv.includes('--pix')) {
    const payment = await fetch(base + '/api/pagamentos/gateway/cobranca', { method: 'POST', headers, body: JSON.stringify({ reserva_id: 1, metodo: 'Pix' }) });
    report.results.pixCreationHttpStatus = payment.status;
    const body = await payment.json();
    report.results.pixQrReturned = Boolean(body.copia_cola && body.gateway_ref && !body.is_estatico);
  }
  const unsigned = await fetch(base + '/api/pagamentos/gateway/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'payment.updated', data: { id: '1' } }) });
  report.results.unsignedWebhookRejected = unsigned.status === 403;
  await fetch(base + '/api/auth/logout', { method: 'POST', headers });
  report.results.loggedOutSessionRejected = (await fetch(base + '/api/auth/me', { headers })).status === 401;
  fs.writeFileSync(path.join(folder, 'flow-check.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!connect.ok || (process.argv.includes('--pix') && !report.results.pixQrReturned)) process.exitCode = 1;
}
main().catch(error => { console.error('Homologation flow failed:', error.code || error.name, error.actual ?? ''); process.exitCode = 1; });
