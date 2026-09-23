const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sqlite = require('sqlite3');
const folder = path.resolve(__dirname, '../../.local-security/homologacao');
async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(folder, 'instance/config.json')));
  assert.ok(config.MERCADO_PAGO_ACCESS_TOKEN.startsWith('TEST-'));
  const db = new sqlite.Database(path.join(folder, 'instance/backend/data/courtmanager.sqlite'), sqlite.OPEN_READONLY);
  const all = sql => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
  let rows, counts, integrity, foreignKeys;
  try {
    rows = await all('SELECT t.gateway_ref,t.valor,a.gateway_user_id,a.gateway_access_token,i.amount_cents,i.state FROM TransacoesGateway t JOIN Reservas r ON r.id=t.reserva_id JOIN Arenas a ON a.id=r.tenant_id JOIN PaymentIntents i ON i.gateway_ref=t.gateway_ref WHERE r.id=1');
    counts = await all('SELECT (SELECT COUNT(*) FROM TransacoesGateway) AS transactions,(SELECT COUNT(*) FROM PaymentIntents) AS intents,(SELECT COALESCE(SUM(valor),0) FROM Pagamentos) AS paidCents');
    integrity = await all('PRAGMA integrity_check');
    foreignKeys = await all('PRAGMA foreign_key_check');
  } finally { await new Promise(resolve => db.close(resolve)); }
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.match(row.gateway_ref, /^\d+$/);
  const response = await fetch('https://api.mercadopago.com/v1/payments/' + row.gateway_ref, {
    headers: { Authorization: `Bearer ${config.MERCADO_PAGO_ACCESS_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200);
  const payment = await response.json();
  const report = { at: new Date().toISOString(), testPaymentId: String(payment.id), liveMode: payment.live_mode,
    status: payment.status, amountReais: payment.transaction_amount, currency: payment.currency_id,
    receiverMatchesArena: String(payment.collector_id) === String(row.gateway_user_id),
    intentCents: row.amount_cents, transactionCents: row.valor, intentState: row.state,
    arenaCredentialEncrypted: row.gateway_access_token.startsWith('enc:v2:homologacao:'),
    ...counts[0], integrityOk: integrity[0]?.integrity_check === 'ok', foreignKeyErrors: foreignKeys.length,
    externalHomologationApproved: false };
  fs.writeFileSync(path.join(folder, 'payment-check.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(payment.live_mode, false);
  assert.equal(payment.transaction_amount, 100);
  assert.equal(payment.currency_id, 'BRL');
  assert.equal(report.receiverMatchesArena, true);
  assert.equal(row.amount_cents, 10000);
  assert.equal(row.valor, 10000);
}
main().catch(error => { console.error('Payment verification failed:', error.cause?.code || error.code || error.name); process.exitCode = 1; });
