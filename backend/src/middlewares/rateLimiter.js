const rateLimit = require('express-rate-limit');

const isTest = () => process.env.NODE_ENV === 'test';

// Bloqueio de IP após 10 tentativas de login falhas consecutivas em 5 minutos
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 5 minutos.' },
  skipSuccessfulRequests: true,
  skip: isTest
});

// Limite para consultas públicas gerais (DDoS Protection: max 100 requisições/min por IP)
const publicApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { error: 'Muitas requisições. Por favor, aguarde um minuto antes de tentar novamente.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTest
});

// Limite para rotas sensíveis de autenticação pública (Brute Force Protection: max 10 tentativas a cada 15 min por IP)
const publicAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de acesso. Por segurança, aguarde 15 minutos.' },
  skipSuccessfulRequests: true,
  skip: isTest
});

// Limite para criação de reservas públicas (Bot Spam Protection: max 15 agendamentos a cada 10 min por IP)
const publicBookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  message: { error: 'Limite de agendamentos atingido. Aguarde alguns minutos antes de realizar uma nova reserva.' },
  skip: isTest
});

const globalLimiter = rateLimit({ windowMs:60000,limit:300,standardHeaders:true,legacyHeaders:false,skip:isTest });
const recoveryLimiter = rateLimit({windowMs:900000,limit:5,standardHeaders:true,legacyHeaders:false,skip:isTest});
module.exports = { globalLimiter, recoveryLimiter,
  loginLimiter,
  publicApiLimiter,
  publicAuthLimiter,
  publicBookingLimiter
};
