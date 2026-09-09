const nodemailer = require('nodemailer');

const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
const port = parseInt(process.env.EMAIL_PORT || '465');
const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // true para porta 465 com SSL
  auth: {
    user,
    pass,
  },
});

/**
 * Envia um e-mail em background usando SMTP configurado.
 * @param {string} to - Destinatário
 * @param {string} subject - Assunto
 * @param {string} htmlContent - Conteúdo HTML do e-mail
 */
const sendEmail = async (to, subject, htmlContent) => {
  if (!user || !pass) {
    console.warn('[SMTP] Credenciais de e-mail não configuradas no .env. Ignorando envio.');
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Arenix CourtManager" <${user}>`,
      to,
      subject,
      html: htmlContent,
    });
    const safeTo = String(to || '').replace(/[\r\n]/g, '');
    console.log(`[SMTP] E-mail enviado com sucesso para ${safeTo}. MessageId: ${info.messageId}`);
    return true;
  } catch (error) {
    const safeTo = String(to || '').replace(/[\r\n]/g, '');
    const safeErrMsg = String(error?.message || '').replace(/[\r\n]/g, '');
    console.error(`[SMTP] Erro ao enviar e-mail para ${safeTo}:`, safeErrMsg);
    return false;
  }
};

module.exports = { sendEmail };
