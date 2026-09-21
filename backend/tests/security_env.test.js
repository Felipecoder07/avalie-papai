const { validateEnvironment } = require('../src/config/envValidation');

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('JWT_SECRET', 'production-fixture-key-' + 'a'.repeat(48));
  vi.stubEnv('FRONTEND_URL', 'https://fixture.example.test');
  vi.stubEnv('CORS_ALLOWED_ORIGINS', 'https://fixture.example.test');
  vi.stubEnv('SECRETS_KEYRING', JSON.stringify({ first: 'ab'.repeat(32) }));
  vi.stubEnv('SECRETS_ACTIVE_KEY_ID', 'first');
  vi.stubEnv('TRUST_PROXY', '127.0.0.1/32,::1/128');
  vi.stubEnv('LISTEN_HOST', '127.0.0.1');
});
afterEach(() => vi.unstubAllEnvs());

it('accepts complete production configuration', () => expect(validateEnvironment()).toBeUndefined());
it('allows local development without production settings', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('JWT_SECRET', '');
  expect(validateEnvironment()).toBeUndefined();
});
it.each([
  ['JWT_SECRET', ''], ['JWT_SECRET', 'short'], ['FRONTEND_URL', 'http://fixture.example.test'],
  ['CORS_ALLOWED_ORIGINS', '*'], ['CORS_ALLOWED_ORIGINS', 'https://fixture.example.test/path'],
  ['SECRETS_ACTIVE_KEY_ID', 'missing'], ['SECRETS_KEYRING', '{}'],
  ['TRUST_PROXY', 'true'], ['TRUST_PROXY', '0.0.0.0/0'], ['TRUST_PROXY', ''], ['LISTEN_HOST', '0.0.0.0'],
])('fails before startup for invalid %s', (key, value) => {
  vi.stubEnv(key, value);
  expect(validateEnvironment).toThrow();
});
