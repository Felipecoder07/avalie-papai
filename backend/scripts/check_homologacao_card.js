// Synthetic provider test cards only. This does not validate the browser card UI.
// Test data: Mercado Pago Checkout API documentation, test/cards (22 Sep 2026).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sqlite = require('sqlite3');
const folder = path.resolve(__dirname, '../../.local-security/homologacao');
const scenario = process.argv[2];
assert.ok(['APRO', 'OTHE'].includes(scenario), 'Choose APRO or OTHE.');
const reservationId = scenario === 'APRO' ? 20001 : 20002;
async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(folder, 'instance/config.json')));
  assert.ok(config.MERCADO_PAGO_ACCESS_TOKEN.startsWith('TEST-'));
  const db = new sqlite.Database(path.join(folder, 'instance/backend/data/courtmanager.sqlite'), sqlite.OPEN_READWRITE);
  const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
  try {
    assert.equal((await all('SELECT id FROM PaymentIntents WHERE reserva_id=?', [reservationId])).length, 0, 'Existing attempt preserved: do not create another charge.');
    const existing = await all('SELECT grupo_id FROM Reservas WHERE id=?', [reservationId]);
    if (existing.length) assert.equal(existing[0].grupo_id, 'homologacao-card-' + scenario);
    else await all("INSERT INTO Reservas(id,tenant_id,cliente_id,quadra_id,data_reserva,hora_inicio,hora_fim,valor_total,status,status_pagamento,grupo_id) VALUES(?,1,1,1,'2099-12-01',?,?,10000,'Pendente','Pendente',?)", [reservationId, scenario === 'APRO' ? '12:00' : '13:00', scenario === 'APRO' ? '13:00' : '14:00', 'homologacao-card-' + scenario]);
  } finally { await new Promise(resolve => db.close(resolve)); }
  const tokenResponse = await fetch('https://api.mercadopago.com/v1/card_tokens', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${config.MERCADO_PAGO_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_number: '5480832801033311', security_code: '123', expiration_month: 11, expiration_year: 2030, cardholder: { name: scenario, identification: { type: 'CPF', number: '12345678909' } } }),
  });
  const card = await tokenResponse.json();
  assert.ok(tokenResponse.ok && card.id, 'Test card tokenization did not succeed: HTTP ' + tokenResponse.status);
  const login = JSON.parse(fs.readFileSync(path.join(folder, 'instance/login.json')));
  const base = 'http://127.0.0.1:3100';
  const session = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: login.email, senha: login.password }) });
  assert.equal(session.status, 200);
  const cookies = session.headers.getSetCookie().map(value => value.split(';')[0]);
  const headers = { 'Content-Type': 'application/json', Cookie: cookies.join('; '), 'x-csrf-token': cookies.find(value => value.startsWith('cm_csrf=')).slice(8) };
  const response = await fetch(base + '/api/pagamentos/gateway/cobranca', { method: 'POST', headers, body: JSON.stringify({ reserva_id: reservationId, metodo: 'cartao', card_data: { token: card.id, payment_method_id: 'master' } }) });
  const result = await response.json();
  const report = { at: new Date().toISOString(), scenario, reservationId, httpStatus: response.status, status: result.status, testPaymentId: result.gateway_ref, browserFlowValidated: false };
  if (/^\d+$/.test(result.gateway_ref || '')) {
    const queried = await fetch('https://api.mercadopago.com/v1/payments/' + result.gateway_ref, { headers: { Authorization: `Bearer ${config.MERCADO_PAGO_ACCESS_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
    const payment = await queried.json();
    Object.assign(report, { providerStatus: payment.status, liveMode: payment.live_mode, amountReais: payment.transaction_amount, currency: payment.currency_id });
    assert.equal(payment.live_mode, false);
  }
  await fetch(base + '/api/auth/logout', { method: 'POST', headers });
  fs.writeFileSync(path.join(folder, 'card-' + scenario + '.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(response.status, 200);
  assert.equal(report.providerStatus, scenario === 'APRO' ? 'approved' : 'rejected');
}
main().catch(error => { console.error('Synthetic card check failed:', error.cause?.code || error.code || error.name, error.code === 'ERR_ASSERTION' ? error.message : ''); process.exitCode = 1; });
