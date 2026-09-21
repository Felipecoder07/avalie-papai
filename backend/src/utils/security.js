const crypto = require('node:crypto');

const production = () => process.env.NODE_ENV === 'production';
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const secret = () => crypto.randomBytes(32).toString('base64url');
const publicErrors = new WeakSet();
function httpError(status, message) {
  const error = Object.assign(new Error(message), { status });
  publicErrors.add(error);
  return error;
}
function publicError(error, fallback = 'Não foi possível concluir a operação.') {
  return publicErrors.has(error) ? error.message : fallback;
}
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
  require('./secretEncryption').loadKeys({ requireActive: true });
  require('../config/proxy').validateProxyEnvironment();
  for (const origin of process.env.CORS_ALLOWED_ORIGINS.split(',').map(value => value.trim())) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('CORS_ALLOWED_ORIGINS exige origens HTTPS exatas.');
  }
}
const { encrypt, decrypt } = require('./secretEncryption');
const simulationAllowed = () => process.env.NODE_ENV === 'test';
module.exports = { production, hash, secret, httpError, publicError, passwordError, cents, frontendUrl, validateEnvironment, encrypt, decrypt, simulationAllowed };
