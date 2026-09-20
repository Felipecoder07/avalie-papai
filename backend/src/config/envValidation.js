const logger = require('../utils/safeLogger').forModule('envValidation');

function validateEnvironment() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    logger.log('[Config] Inicializando em modo de Desenvolvimento/Teste.');
    return;
  }

  logger.log('[Config] Inicializando em modo de PRODUÇÃO. Validando segredos...');

  const requiredSecrets = [
    'JWT_SECRET',
    // Pode expandir para banco de dados ou chaves externas se obrigatório no boot
  ];

  const missing = [];

  for (const secret of requiredSecrets) {
    const value = process.env[secret];
    if (!value || value.trim().length < 16) {
      missing.push(secret);
    }
  }

  if (missing.length > 0) {
    logger.error(`[FATAL] Configuração inválida. Os seguintes segredos estão ausentes ou fracos: ${missing.join(', ')}`);
    logger.error('O sistema não pode iniciar em produção de forma insegura (Fail-fast).');
    process.exit(1);
  }

  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (!allowedOrigins || allowedOrigins.trim() === '') {
    logger.warn('[Aviso de Segurança] CORS_ALLOWED_ORIGINS não definido. O acesso web poderá ser negado a origens desconhecidas.');
  }

  logger.log('[Config] Todos os requisitos de segurança de ambiente foram validados.');
}

module.exports = { validateEnvironment };
