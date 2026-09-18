// Local audit only: in-memory SQLite, fictitious identities, no external requests/email.
// This records vulnerabilities, not a passing security regression suite.
// Run from backend: node tests/security_audit_review.cjs
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'isolated-audit-secret-not-used-by-any-real-system';
const db = new sqlite3.Database(':memory:');
for (const method of ['get', 'all']) {
  db[method + 'Async'] = (sql, params = []) => new Promise((resolve, reject) =>
    db[method](sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
db.runAsync = (sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
function replaceModule(relative, exports) {
  const id = require.resolve(relative);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
replaceModule('../src/config/database', db);
replaceModule('../src/services/emailService', { sendEmail: async () => true });
replaceModule('dotenv', { config: () => ({ parsed: {} }) });
let providerCalls = 0;
global.fetch = async () => { providerCalls++; throw new Error('External network disabled by local audit'); };
const app = require('../src/app');
const findings = [];
function record(id, evidence) { findings.push({ id, ...evidence }); }
async function login(email, senha = 'Audit-password-123!') {
  const res = await request(app).post('/api/auth/login').send({ email, senha });
  assert.equal(res.status, 200, 'Fixture login failed');
  return res.body.token;
}
const auth = token => `Bearer ${token}`;
async function main() {
  require('../src/config/init_db')();
  // Flush schema and nested migration callbacks before inserting fixtures.
  await new Promise(resolve => setTimeout(resolve, 1000));
  await db.getAsync('SELECT 1');
  const password = await bcrypt.hash('Audit-password-123!', 10);
  await db.runAsync("INSERT INTO Arenas (id, nome, slug, status, chave_pix) VALUES (91001, 'Audit Arena A', 'audit-a', 1, 'pix@example.test'), (91002, 'Audit Arena B', 'audit-b', 1, 'pix-b@example.test')");
  await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES ('manutencao_ativa', '0')");
  await db.runAsync("INSERT INTO Clientes (id, tenant_id, nome, email, telefone, cpf) VALUES (91101, 91001, 'Audit Attacker', 'attacker@example.test', '(11) 90000-0001', '00000000001'), (91102, 91001, 'Audit Victim', 'victim@example.test', '(11) 90000-0002', '00000000002'), (91103, 91002, 'Audit Other', 'other@example.test', '(11) 90000-0003', '00000000003')");
  for (const [id, email, perfil, cliente] of [[91201, 'attacker@example.test', 'Cliente', 91101], [91202, 'victim@example.test', 'Cliente', 91102], [91203, 'admin@example.test', 'Administrador', null]]) {
    await db.runAsync('INSERT INTO Usuarios (id, tenant_id, cliente_id, nome, email, senha_hash, perfil, ativo) VALUES (?, 91001, ?, ?, ?, ?, ?, 1)', [id, cliente, 'Audit User', email, password, perfil]);
  }
  await db.runAsync("INSERT INTO Quadras (id, tenant_id, nome, preco_base, status) VALUES (91301, 91001, 'Audit Court', 100, 'Ativa')");
  for (const [id, hour, group] of [[91401, '10:00', null], [91402, '11:00', null], [91403, '12:00', null], [91404, '13:00', 'audit-group'], [91405, '14:00', 'audit-group']]) {
    await db.runAsync("INSERT INTO Reservas (id, tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total, status, status_pagamento, grupo_id) VALUES (?, 91001, 91102, 91301, '2099-12-20', ?, ?, 100, 'Pendente', 'Pendente', ?)", [id, hour, String(Number(hour.slice(0, 2)) + 1) + ':00', group]);
  }
  const clientToken = await login('attacker@example.test');
  const adminToken = await login('admin@example.test');
  const victimToken = await login('victim@example.test');

  // Invalid provider signature, expired, wrong issuer and audience; production branch.
  const fakeGoogle = jwt.sign({ email: 'victim@example.test', name: 'Audit Victim', aud: 'wrong-app', iss: 'not-google', exp: 1 }, 'unrelated-key');
  const google = await request(app).post('/api/public/tenant/audit-a/google').send({ credential: fakeGoogle });
  record('google_forgery', { status: google.status, victimSessionIssued: Boolean(google.body.token && jwt.decode(google.body.token).id === 91202) });
  if (google.body.token) {
    const profile = await request(app).get('/api/public/tenant/audit-a/meu-perfil').set('Authorization', auth(google.body.token));
    record('forged_google_reads_profile', { status: profile.status, victimCpfReturned: JSON.stringify(profile.body).includes('00000000002') });
  }

  const list = await request(app).get('/api/clientes').set('Authorization', auth(clientToken));
  record('client_reads_other_clients', { status: list.status, victimEmailReturned: JSON.stringify(list.body).includes('victim@example.test') });
  const financial = await request(app).get('/api/pagamentos/reservas').set('Authorization', auth(clientToken));
  record('client_reads_other_payments', { status: financial.status, victimReservationReturned: financial.body.some?.(r => r.id === 91401) || false });
  const manual = await request(app).post('/api/pagamentos').set('Authorization', auth(clientToken)).send({ reserva_id: 91401, valor: 100, metodo: 'Pix Online' });
  record('client_marks_payment_without_provider', { status: manual.status, reservation: await db.getAsync('SELECT status_pagamento FROM Reservas WHERE id = 91401'), providerCalls });

  const free = await request(app).post('/api/reservas').set('Authorization', auth(clientToken)).send({ cliente_id: 91103, quadra_id: 91301, data_reserva: '2099-12-21', hora_inicio: '10:00', hora_fim: '11:00', valor_total: 0 });
  record('client_creates_free_cross_tenant_client_booking', { status: free.status, reservation: await db.getAsync("SELECT tenant_id, cliente_id, valor_total, status_pagamento FROM Reservas WHERE data_reserva = '2099-12-21'") });

  const phone = await request(app).get('/api/public/tenant/audit-a/minhas-reservas').query({ telefone: '(11) 90000-0002' });
  record('anonymous_phone_data_leak', { status: phone.status, victimEmailReturned: JSON.stringify(phone.body).includes('victim@example.test'), victimCpfReturned: JSON.stringify(phone.body).includes('00000000002') });
  const cancel = await request(app).post('/api/public/tenant/audit-a/cancelar-pendente').send({ reserva_id: 91402 });
  record('anonymous_cancels_booking', { status: cancel.status, reservation: await db.getAsync('SELECT status FROM Reservas WHERE id = 91402') });
  const wrongSlug = await request(app).get('/api/public/tenant/audit-b/status-reserva/91403');
  record('anonymous_status_ignores_tenant_slug', { status: wrongSlug.status, returnedReservationId: wrongSlug.body.reserva_id });

  const promote = await request(app).put('/api/usuarios/91203').set('Authorization', auth(adminToken)).send({ nome: 'Audit Admin', email: 'admin@example.test', perfil: 'SuperAdmin' });
  const promotedToken = await login('admin@example.test');
  const master = await request(app).get('/api/saas/arenas').set('Authorization', auth(promotedToken));
  record('tenant_admin_becomes_superadmin', { editStatus: promote.status, newRole: jwt.decode(promotedToken).perfil, masterStatus: master.status, otherArenaReturned: JSON.stringify(master.body).includes('Audit Arena B') });
  await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS (chave, valor) VALUES ('mp_master_access_token', 'TEST-AUDIT-MASTER-SECRET'), ('mp_client_secret', 'TEST-AUDIT-OAUTH-SECRET')");
  const secrets = await request(app).get('/api/saas/configuracoes').set('Authorization', auth(promotedToken));
  record('promoted_admin_reads_payment_secrets', { status: secrets.status, masterTokenReturned: JSON.stringify(secrets.body).includes('TEST-AUDIT-MASTER-SECRET'), oauthSecretReturned: JSON.stringify(secrets.body).includes('TEST-AUDIT-OAUTH-SECRET') });

  const overwrite = await request(app).post('/api/public/tenant/audit-a/agendar').send({ nome: 'Audit Overwritten', email: 'other@example.test', telefone: '(11) 90000-0099', cpf: '00000000099', quadra_id: 91301, data_reserva: '2099-12-22', hora_inicio: '10:00', hora_fim: '11:00' });
  record('anonymous_checkout_overwrites_other_tenant_client', { status: overwrite.status, victim: await db.getAsync('SELECT tenant_id, nome, telefone, cpf FROM Clientes WHERE id = 91103') });

  const logout = await request(app).post('/api/auth/logout').set('Authorization', auth(clientToken));
  const afterLogout = await request(app).get('/api/clientes').set('Authorization', auth(clientToken));
  await db.runAsync('UPDATE Usuarios SET ativo = 0 WHERE id = 91201');
  const afterDisable = await request(app).get('/api/clientes').set('Authorization', auth(clientToken));
  record('revoked_session_still_works', { logoutStatus: logout.status, afterLogoutStatus: afterLogout.status, afterDisableStatus: afterDisable.status });

  await db.runAsync("INSERT INTO TransacoesGateway (reserva_id, gateway_ref, valor, status, metodo) VALUES (91403, '9910001', 100, 'Pendente', 'Pix')");
  // The only mocked dependency is the external provider, which confirms ONE real payment.
  global.fetch = async () => { providerCalls++; return { ok: true, json: async () => ({ id: 9910001, status: 'approved', transaction_amount: 100 }) }; };
  await db.runAsync("UPDATE Arenas SET gateway_access_token = 'TEST-AUDIT-FAKE' WHERE id = 91001");
  const repeated = await Promise.all(Array.from({ length: 5 }, () => request(app).post('/api/pagamentos/gateway/webhook').send({ action: 'payment.updated', data: { id: 9910001 } })));
  record('concurrent_webhooks_duplicate_payment', { statuses: repeated.map(r => r.status), entries: await db.getAsync('SELECT COUNT(*) AS count, SUM(valor) AS total FROM Pagamentos WHERE reserva_id = 91403') });
  global.fetch = async () => ({ ok: true, json: async () => ({ id: 9910002, point_of_interaction: { transaction_data: { qr_code_base64: 'YXVkaXQ=', qr_code: 'audit-only' } } }) });
  const partial = await request(app).post('/api/pagamentos/gateway/cobranca').set('Authorization', auth(victimToken)).send({ reserva_id: 91404, metodo: 'Pix', valor: 1 });
  global.fetch = async () => ({ ok: true, json: async () => ({ id: 9910002, status: 'approved', transaction_amount: 1 }) });
  const partialWebhook = await request(app).post('/api/pagamentos/gateway/webhook').send({ action: 'payment.updated', data: { id: 9910002 } });
  record('partial_payment_marks_group_paid', { chargeStatus: partial.status, webhookStatus: partialWebhook.status, reservations: await db.allAsync('SELECT id, valor_total, status_pagamento FROM Reservas WHERE id IN (91404, 91405)'), paid: await db.getAsync('SELECT SUM(valor) AS total FROM Pagamentos WHERE reserva_id IN (91404, 91405)') });
  global.fetch = async () => { throw new Error('External network disabled by local audit'); };

  // SQLite string comparison of ISO T timestamps versus datetime('now') format.
  const expired = new Date(Date.now() - 2 * 3600000).toISOString();
  const dateCheck = await db.getAsync("SELECT ? > datetime('now') AS accepted, datetime(?) > datetime('now') AS actuallyValid", [expired, expired]);
  record('reset_expiry_format', { expiredByHours: 2, ...dateCheck });
  if (dateCheck.accepted && !dateCheck.actuallyValid) {
    await db.runAsync("UPDATE Usuarios SET reset_password_token = 'audit-expired-reset-token', reset_password_expires = ? WHERE id = 91202", [expired]);
    const reset = await request(app).post('/api/auth/reset-password').send({ token: 'audit-expired-reset-token', novaSenha: 'Audit-reset-password-123!' });
    record('expired_reset_token_accepted_http', { status: reset.status, passwordChanged: await bcrypt.compare('Audit-reset-password-123!', (await db.getAsync('SELECT senha_hash FROM Usuarios WHERE id = 91202')).senha_hash) });
  }
  fs.writeFileSync(path.join(__dirname, '../../docs/security-audit-evidence.json'), JSON.stringify({ environment: 'production branches; SQLite :memory:; fake identities; external providers mocked', findings }, null, 2) + '\n');
  console.log(JSON.stringify(findings, null, 2));
  // Drain background audit/email queries, then close the isolated database.
  await new Promise(resolve => setTimeout(resolve, 100));
  await new Promise((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
}
main().catch(error => { console.error(error); process.exitCode = 1; db.close(); });
