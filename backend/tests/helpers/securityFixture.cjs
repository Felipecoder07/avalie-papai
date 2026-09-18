const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const request = require('supertest');
const db = require('../../src/config/database');
const { ensureSecuritySchema } = require('../../src/config/securitySchema');

const PASSWORD = 'SecureTest123!';
const MFA_SECRET = 'KRSXG5DSNFXGOIDBNZSSA5DFON2A';
const WEBHOOK_SECRET = 'fixture-webhook-secret-not-a-real-credential';
const actors = {
  admin: 1, owner: 2, third: 3, otherAdmin: 4, master: 5,
  manager: 6, receptionist: 7, otherOwner: 8, otherManager: 9, otherReceptionist: 10,
};

// init_db uses nested sqlite callbacks. Track completion of those callbacks
// rather than sleeping an arbitrary number of milliseconds before seeding.
async function initialize() {
  assert.equal(process.env.NODE_ENV, 'test');
  const databases = await db.allAsync('PRAGMA database_list');
  assert.equal(databases.find(row => row.name === 'main').file, '', 'Fixtures require an in-memory database');
  await new Promise((resolve, reject) => {
    let pending = 0, scheduling = true, firstError;
    const originals = {};
    function finished() {
      if (scheduling || pending) return;
      for (const [method, original] of Object.entries(originals)) db[method] = original;
      if (firstError) reject(firstError); else resolve();
    }
    for (const method of ['run', 'get', 'all', 'exec']) {
      originals[method] = db[method];
      db[method] = function (...args) {
        const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
        pending++;
        return originals[method].call(this, ...args, function (error, ...values) {
          if (error && !/duplicate column name/i.test(error.message)) firstError ||= error;
          try { callback?.call(this, error, ...values); }
          catch (failure) { firstError ||= failure; }
          finally { pending--; finished(); }
        });
      };
    }
    try { require('../../src/config/init_db')(); } catch (error) { firstError = error; }
    scheduling = false;
    finished();
  });
  await ensureSecuritySchema(db);
}

let passwordHash;
async function seed() {
  passwordHash ||= await bcrypt.hash(PASSWORD, 4);
  for (const table of ['SessionMfa', 'MfaRecovery', 'MfaEnrollment', 'PaymentAllocations', 'GatewayCredits', 'RefundIntents', 'SecurityOutbox', 'PaymentIntents', 'AuthSessions', 'RecoveryChallenges', 'ExternalIdentities', 'ClientMemberships', 'GuestAccess', 'OAuthStates', 'OAuthCodesUsados', 'TransacoesGateway', 'Pagamentos', 'Reservas', 'Bloqueios', 'Quadras', 'Clientes', 'SessoesAtivas', 'Usuarios', 'Arenas']) {
    await db.runAsync('DELETE FROM ' + table);
  }
  await db.runAsync("INSERT OR REPLACE INTO ConfiguracoesSaaS(chave,valor) VALUES('manutencao_ativa','0'),('mp_webhook_secret',?),('mp_master_access_token','FIXTURE-MASTER-SECRET'),('mp_client_secret','FIXTURE-CLIENT-SECRET')", [WEBHOOK_SECRET]);
  await db.runAsync("INSERT INTO Arenas(id,nome,slug,status,chave_pix) VALUES(1,'Arena A','arena-a',1,'pix-a@example.test'),(2,'Arena B','arena-b',1,'pix-b@example.test')");
  await db.runAsync("INSERT INTO Clientes(id,tenant_id,nome,email,telefone,cpf) VALUES(1,1,'Owner','owner@example.test','11900000001','11111111111'),(2,1,'Third','third@example.test','11900000002','22222222222'),(3,2,'Foreign','foreign@example.test','11900000003','33333333333')");
  const users = [[1,'Administrador',1,null],[2,'Cliente',1,1],[3,'Cliente',1,2],[4,'Administrador',2,null],[5,'SuperAdmin',null,null],[6,'Gerente',1,null],[7,'Recepcionista',1,null],[8,'Cliente',2,3],[9,'Gerente',2,null],[10,'Recepcionista',2,null]];
  for (const [id, role, tenant, client] of users) {
    await db.runAsync('INSERT INTO Usuarios(id,tenant_id,cliente_id,nome,email,perfil,senha_hash,ativo,two_factor_secret) VALUES(?,?,?,?,?,?,?,1,?)', [id,tenant,client,'User'+id,'u'+id+'@example.test',role,passwordHash,id === actors.master ? MFA_SECRET : null]);
  }
  await db.runAsync("INSERT INTO Quadras(id,tenant_id,nome,preco_base,status) VALUES(1,1,'Court A',100,'Ativa'),(2,2,'Court B',100,'Ativa')");
  await db.runAsync("INSERT INTO Reservas(id,tenant_id,cliente_id,quadra_id,data_reserva,hora_inicio,hora_fim,valor_total,status,status_pagamento,grupo_id) VALUES(1,1,1,1,'2099-12-01','10:00','11:00',100,'Pendente','Pendente','group-a'),(2,1,1,1,'2099-12-01','11:00','12:00',100,'Pendente','Pendente','group-a'),(3,2,3,2,'2099-12-01','10:00','11:00',100,'Pendente','Pendente','group-b')");
}

function totp() {
  const bits = [...MFA_SECRET].map(c => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  return ((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
async function login(app, id = actors.admin) {
  const response = await request(app).post('/api/auth/login').send({ email: 'u'+id+'@example.test', senha: PASSWORD, ...(id === actors.master ? { codigo_2fa: totp() } : {}) });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const pairs = response.headers['set-cookie'].map(value => value.split(';')[0]);
  return { cookie: pairs.join('; '), csrf: pairs.find(v => v.startsWith('cm_csrf=')).split('=')[1], response };
}
const auth = (req, session) => session ? req.set('Cookie', session.cookie).set('x-csrf-token', session.csrf) : req;
function signedWebhook(app, id, { secret = WEBHOOK_SECRET, timestamp = Date.now() } = {}) {
  const requestId = crypto.randomUUID();
  const digest = crypto.createHmac('sha256', secret).update(`id:${id};request-id:${requestId};ts:${timestamp};`).digest('hex');
  return request(app).post('/api/pagamentos/gateway/webhook').query({ 'data.id': String(id) }).set('x-request-id', requestId).set('x-signature', `ts=${timestamp},v1=${digest}`).send({ action: 'payment.updated', data: { id: String(id) } });
}
const close = () => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
module.exports = { db, initialize, seed, login, auth, actors, PASSWORD, signedWebhook, close };
