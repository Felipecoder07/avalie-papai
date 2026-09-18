import { createRequire } from 'node:module';
import { vi } from 'vitest';

const require = createRequire(import.meta.url);
process.env.NODE_ENV = 'test';
process.env.TEST_DB_PATH = ':memory:';
// Never load a developer's .env or send real messages/payments from a suite.
vi.spyOn(require('dotenv'), 'config').mockReturnValue({ parsed: {} });
for (const name of Object.keys(process.env)) {
  if (/^(EMAIL_|MERCADO_?PAGO|MP_|GOOGLE_|SUPABASE_|SECRETS_ENCRYPTION_KEY|ENABLE_PAYMENT_SIMULATION|FRONTEND_URL|APP_URL|CORS_ALLOWED_ORIGINS|TRUST_PROXY)/.test(name)) delete process.env[name];
}
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.JWT_SECRET = 'test-only-secret-never-used-outside-isolated-suites';
vi.spyOn(require('nodemailer'), 'createTransport').mockReturnValue({
  sendMail: vi.fn().mockRejectedValue(new Error('SMTP disabled in tests; mock emailService explicitly.')),
});
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('External requests disabled; configure a provider fixture.')));
