const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const validId = /^[A-Za-z0-9_-]{1,40}$/;
const validKey = /^[a-f0-9]{64}$/i;
const production = () => process.env.NODE_ENV === 'production';
function unavailable() {
  return Object.assign(new Error('Protecao de segredos indisponivel. Verifique as chaves e a migracao.'), { status: 503 });
}

function loadKeys({ requireActive = false } = {}) {
  try {
    let serialized = process.env.SECRETS_KEYRING;
    const filename = process.env.SECRETS_KEYRING_FILE;
    if (serialized && filename) throw unavailable();
    if (filename) {
      if (!path.isAbsolute(filename)) throw unavailable();
      const resolved = fs.realpathSync(filename);
      const applicationRoot = path.resolve(__dirname, '../../..');
      const relative = path.relative(applicationRoot, resolved);
      if (production() && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw unavailable();
      const stat = fs.statSync(resolved);
      if (!stat.isFile() || stat.size > 65536 || (production() && process.platform !== 'win32' && (stat.mode & 0o077))) throw unavailable();
      serialized = fs.readFileSync(resolved, 'utf8');
    }
    const parsed = serialized ? JSON.parse(serialized) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw unavailable();
    const keys = new Map();
    for (const [id, hex] of Object.entries(parsed)) {
      if (!validId.test(id) || typeof hex !== 'string' || !validKey.test(hex)) throw unavailable();
      keys.set(id, Buffer.from(hex, 'hex'));
    }
    const legacy = process.env.SECRETS_ENCRYPTION_KEY;
    if (legacy) {
      if (!validKey.test(legacy)) throw unavailable();
      if (keys.has('legacy') && !keys.get('legacy').equals(Buffer.from(legacy, 'hex'))) throw unavailable();
      keys.set('legacy', Buffer.from(legacy, 'hex'));
    }
    const activeId = process.env.SECRETS_ACTIVE_KEY_ID || (!production() && legacy ? 'legacy' : undefined);
    if (activeId && (!validId.test(activeId) || !keys.has(activeId))) throw unavailable();
    if ((requireActive || production() || keys.size > 0) && !activeId) throw unavailable();
    return { keys, activeId };
  } catch {
    throw unavailable();
  }
}

function encrypt(value) {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value !== 'string') throw unavailable();
  const { keys, activeId } = loadKeys();
  if (!activeId) return value; // Development only; production requires a keyring.
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.get(activeId), iv);
  cipher.setAAD(Buffer.from(`arenix:secret:v2:${activeId}`));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['enc', 'v2', activeId, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}

function decode(part, length) {
  if (!part || !/^[A-Za-z0-9_-]+$/.test(part)) throw unavailable();
  const bytes = Buffer.from(part, 'base64url');
  if (bytes.toString('base64url') !== part || (length && bytes.length !== length)) throw unavailable();
  return bytes;
}

function decrypt(value, { allowPlaintext = false } = {}) {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value !== 'string') throw unavailable();
  if (!value.startsWith('enc:')) {
    if (production() && !allowPlaintext) throw unavailable();
    return value;
  }
  try {
    const parts = value.split(':');
    const version = parts[1];
    if (!((version === 'v1' && parts.length === 5) || (version === 'v2' && parts.length === 6))) throw unavailable();
    const id = version === 'v1' ? 'legacy' : parts[2];
    const [iv, tag, data] = parts.slice(version === 'v1' ? 2 : 3);
    const { keys } = loadKeys();
    if (!keys.has(id)) throw unavailable();
    const decipher = crypto.createDecipheriv('aes-256-gcm', keys.get(id), decode(iv, 12));
    if (version === 'v2') decipher.setAAD(Buffer.from(`arenix:secret:v2:${id}`));
    decipher.setAuthTag(decode(tag, 16));
    return Buffer.concat([decipher.update(decode(data)), decipher.final()]).toString('utf8');
  } catch {
    throw unavailable();
  }
}

module.exports = { encrypt, decrypt, loadKeys };
