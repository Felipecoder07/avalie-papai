const crypto = require('node:crypto');
const fixture = require('./helpers/securityFixture.cjs');
const { db } = fixture;
const { encrypt, decrypt } = require('../src/utils/secretEncryption');
const { rotateStoredSecrets } = require('../src/services/secretRotationService');

const key = 'ab'.repeat(32);
const next = 'cd'.repeat(32);
function legacy(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const data = Buffer.concat([cipher.update(value), cipher.final()]);
  return ['enc', 'v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}
beforeAll(fixture.initialize);
beforeEach(async () => {
  vi.stubEnv('SECRETS_KEYRING', JSON.stringify({ legacy: key, next, alias: next }));
  vi.stubEnv('SECRETS_ACTIVE_KEY_ID', 'next');
  await fixture.seed();
  await db.runAsync('UPDATE Arenas SET gateway_access_token=? WHERE id=1', [legacy('legacy-token')]);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(fixture.close);

it('authenticates version/key ID and reads legacy ciphertext', () => {
  const encrypted = encrypt('payment-token');
  expect(encrypted.startsWith('enc:v2:next:')).toBe(true);
  expect(encrypted).not.toContain('payment-token');
  expect(encrypt('payment-token')).not.toBe(encrypted);
  expect(decrypt(encrypted)).toBe('payment-token');
  expect(decrypt(legacy('old'))).toBe('old');
  expect(() => decrypt(encrypted.replace(':next:', ':legacy:'))).toThrow();
  expect(() => decrypt(encrypted.replace(':next:', ':alias:'))).toThrow();
  const parts = encrypted.split(':');
  parts[4] = Buffer.alloc(16).toString('base64url');
  expect(() => decrypt(parts.join(':'))).toThrow();
  vi.stubEnv('SECRETS_KEYRING', JSON.stringify({ other: key }));
  vi.stubEnv('SECRETS_ACTIVE_KEY_ID', 'other');
  expect(() => decrypt(encrypted)).toThrow();
});
it('rejects plaintext in production and refuses encryption without a key', () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(() => decrypt('plaintext-token')).toThrow();
  vi.stubEnv('SECRETS_KEYRING', '{}');
  expect(() => encrypt('token')).toThrow();
});
it('dry run preserves bytes; apply migrates all fields and repeat makes no changes', async () => {
  await db.runAsync('INSERT INTO MfaEnrollment(usuario_id,secret,expires) VALUES(1,?,?)', ['enrollment-secret', Date.now() + 10000]);
  const before = await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id=1');
  const payments = await db.allAsync('SELECT id,valor FROM Pagamentos');
  const report = await rotateStoredSecrets(db);
  expect(report.applied).toBe(false);
  expect(report.changed).toBeGreaterThan(0);
  expect(await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id=1')).toEqual(before);
  const applied = await rotateStoredSecrets(db, { apply: true });
  expect(applied.changed).toBe(report.changed);
  expect(JSON.stringify(applied)).not.toContain('enrollment-secret');
  expect(decrypt((await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id=1')).gateway_access_token)).toBe('legacy-token');
  expect((await db.getAsync('SELECT two_factor_secret FROM Usuarios WHERE id=5')).two_factor_secret).toMatch(/^enc:v2:next:/);
  expect((await db.getAsync('SELECT secret FROM MfaEnrollment WHERE usuario_id=1')).secret).toMatch(/^enc:v2:next:/);
  expect((await rotateStoredSecrets(db, { apply: true })).changed).toBe(0);
  expect(await db.allAsync('SELECT id,valor FROM Pagamentos')).toEqual(payments);
});
it('rolls back earlier changes when a later ciphertext cannot be read', async () => {
  const before = await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id=1');
  await db.runAsync("UPDATE Usuarios SET two_factor_secret='enc:v2:next:invalid' WHERE id=5");
  await expect(rotateStoredSecrets(db, { apply: true })).rejects.toThrow();
  expect(await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id=1')).toEqual(before);
});
