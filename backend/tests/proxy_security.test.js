const express = require('express');
const request = require('supertest');
const { configureProxy, trustedProxies } = require('../src/config/proxy');

afterEach(() => vi.unstubAllEnvs());
it.each(['true', '1', '0.0.0.0/0', '::/0', '127.0.0.1,', '10.0.0.1/33'])('rejects unsafe proxy configuration %s', value => {
  expect(() => trustedProxies({ TRUST_PROXY: value })).toThrow();
});
it('ignores forged forwarded IPs without a trusted proxy', async () => {
  const app = express();
  configureProxy(app, {});
  app.get('/', (req, res) => res.json({ ip: req.ip }));
  const result = await request(app).get('/').set('X-Forwarded-For', '203.0.113.77');
  expect(result.body.ip).not.toBe('203.0.113.77');
});
it('uses the nearest untrusted IP in a forwarded chain', async () => {
  const app = express();
  configureProxy(app, { NODE_ENV: 'production', TRUST_PROXY: '127.0.0.1/32,::1/128' });
  app.get('/', (req, res) => res.json({ ip: req.ip }));
  const result = await request(app).get('/').set('X-Forwarded-For', '203.0.113.77, 198.51.100.42');
  expect(result.status).toBe(200);
  expect(result.body.ip).toBe('198.51.100.42');
});
it('rejects direct access from a socket peer outside the proxy allowlist', async () => {
  const app = express();
  configureProxy(app, { NODE_ENV: 'production', TRUST_PROXY: '10.10.10.10/32' });
  app.get('/', (req, res) => res.sendStatus(200));
  expect((await request(app).get('/').set('X-Forwarded-For', '10.10.10.10')).status).toBe(403);
});
it('changing untrusted tenant/IP headers cannot reset the login limit', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  const app = express();
  configureProxy(app, {});
  app.post('/login', require('../src/middlewares/rateLimiter').loginLimiter, (req, res) => res.sendStatus(401));
  for (let i = 0; i < 10; i++) {
    expect((await request(app).post('/login').set('x-tenant-slug', 'arena-' + i).set('X-Forwarded-For', '203.0.113.' + i)).status).toBe(401);
  }
  expect((await request(app).post('/login').set('x-tenant-slug', 'new-arena')).status).toBe(429);
});
