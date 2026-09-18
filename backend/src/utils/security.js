const crypto = require('node:crypto');

const production = () => process.env.NODE_ENV === 'production';
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const secret = () => crypto.randomBytes(32).toString('base64url');
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
function passwordError(value) {
  return typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value, 'utf8') > 72
    ? 'A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.' : null;
}
function cents(value, { zero = false } = {}) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw httpError(400, 'Valor monetário inválido.');
  const number = Number(value);
  const result = Math.round(number * 100);
  if (!Number.isFinite(number) || !Number.isSafeInteger(result) || result < (zero ? 0 : 1) || Math.abs(number * 100 - result) > 0.000001) throw httpError(400, 'Valor monetário inválido.');
  return result;
}
function frontendUrl() {
  const value = process.env.FRONTEND_URL || process.env.APP_URL;
  if (!value && production()) throw httpError(503, 'URL da aplicação não configurada.');
  const url = new URL(value || 'http://localhost:5173');
  if (production() && url.protocol !== 'https:') throw httpError(503, 'HTTPS é obrigatório.');
  return url.origin;
}
function validateEnvironment() {
  if (!production()) return;
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /seu_jwt|secret-jwt|example/i.test(process.env.JWT_SECRET)) throw new Error('Configure JWT_SECRET forte antes de iniciar produção.');
  frontendUrl();
  if (!process.env.CORS_ALLOWED_ORIGINS) throw new Error('Configure CORS_ALLOWED_ORIGINS em produção.');
  if (!/^[a-f0-9]{64}$/i.test(process.env.SECRETS_ENCRYPTION_KEY || '')) throw new Error('Configure SECRETS_ENCRYPTION_KEY (32 bytes em hexadecimal).');
}
function encrypt(value) {
  if (!value || String(value).startsWith('enc:v1:')) return value;
  const key = process.env.SECRETS_ENCRYPTION_KEY;
  if (!key && !production()) return value;
  if (!/^[a-f0-9]{64}$/i.test(key || '')) throw httpError(503, 'Chave de proteção das integrações não configurada.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const data = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['enc', 'v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}
function decrypt(value) {
  if (!value || !String(value).startsWith('enc:v1:')) return value;
  const [, , iv, tag, data] = value.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(process.env.SECRETS_ENCRYPTION_KEY || '', 'hex'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
const simulationAllowed = () => !production() && (process.env.NODE_ENV === 'test' || process.env.ENABLE_PAYMENT_SIMULATION === 'true');
module.exports = { production, hash, secret, httpError, passwordError, cents, frontendUrl, validateEnvironment, encrypt, decrypt, simulationAllowed };
