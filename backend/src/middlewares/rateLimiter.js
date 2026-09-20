const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const isTest = () => process.env.NODE_ENV === 'test';

// Gera chave única por Tenant/Conta para não punir IPs compartilhados (NAT)
const tenantKeyGenerator = (req, res) => {
  // Usa o gerador nativo do express-rate-limit para evitar erros de validação IPv6 (ERR_ERL_KEY_GEN_IPV6)
  const ipSafe = ipKeyGenerator(req, res);
  
  if (req.user && req.user.tenant_id) {
    return `tenant_${req.user.tenant_id}_${req.user.id || ipSafe}`;
  }
  if (req.headers['x-tenant-slug']) {
    return `slug_${req.headers['x-tenant-slug']}_${ipSafe}`;
  }
  return ipSafe;
};

// Bloqueio de IP após 10 tentativas de login falhas consecutivas em 5 minutos
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 5 minutos.' },
  skipSuccessfulRequests: true,
  skip: isTest,
  keyGenerator: tenantKeyGenerator
});

// Limite para consultas públicas gerais (DDoS Protection: max 100 requisições/min por IP)
const publicApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { error: 'Muitas requisições. Por favor, aguarde um minuto antes de tentar novamente.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTest,
  keyGenerator: tenantKeyGenerator
});

// Limite para rotas sensíveis de autenticação pública (Brute Force Protection: max 10 tentativas a cada 15 min por IP)
const publicAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de acesso. Por segurança, aguarde 15 minutos.' },
  skipSuccessfulRequests: true,
  skip: isTest,
  keyGenerator: tenantKeyGenerator
});

// Limite para criação de reservas públicas (Bot Spam Protection: max 15 agendamentos a cada 10 min por IP)
const publicBookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  message: { error: 'Limite de agendamentos atingido. Aguarde alguns minutos antes de realizar uma nova reserva.' },
  skip: isTest,
  keyGenerator: tenantKeyGenerator
});

const globalLimiter = rateLimit({ windowMs:60000,limit:300,standardHeaders:true,legacyHeaders:false,skip:isTest, keyGenerator: tenantKeyGenerator });
const recoveryLimiter = rateLimit({windowMs:900000,limit:5,standardHeaders:true,legacyHeaders:false,skip:isTest, keyGenerator: tenantKeyGenerator});

// Limite para endpoints de Webhook (tolerância alta para volume de eventos legítimos, mas previne DoS extremo)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  message: { error: 'Muitos eventos recebidos. Rate limit excedido.' },
  skip: isTest
  // Webhooks do Pagar.me vêm dos IPs deles. Não adicionaremos tenantKeyGenerator aqui para isolar o gateway.
});

// Limite para envio de arquivos/uploads para proteger contra enfileiramento de disco
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: { error: 'Limite de envio de arquivos excedido. Tente novamente mais tarde.' },
  skip: isTest,
  keyGenerator: tenantKeyGenerator
});

module.exports = { 
  globalLimiter, 
  recoveryLimiter,
  loginLimiter,
  publicApiLimiter,
  publicAuthLimiter,
  publicBookingLimiter,
  webhookLimiter,
  uploadLimiter
};
