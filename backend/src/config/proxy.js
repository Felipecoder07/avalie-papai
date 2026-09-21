const net = require('node:net');

function trustedProxies(env = process.env) {
  if (!env.TRUST_PROXY) return [];
  const entries = env.TRUST_PROXY.split(',').map(value => value.trim());
  for (const entry of entries) {
    const [address, prefix, extra] = entry.split('/');
    const version = net.isIP(address);
    if (!version || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)))) {
      throw new Error('TRUST_PROXY deve conter somente IPs/CIDRs explicitos, sem redes universais.');
    }
  }
  return entries;
}

function configureProxy(app, env = process.env) {
  const proxies = trustedProxies(env);
  app.set('trust proxy', proxies.length ? proxies : false);
  if (env.NODE_ENV === 'production' && proxies.length) {
    const trust = app.get('trust proxy fn');
    // Check the socket peer before trusting forwarded headers or rate limiting.
    app.use((req, res, next) => trust(req.socket.remoteAddress, 0)
      ? next() : res.status(403).json({ error: 'Acesso permitido somente pelo proxy.' }));
  }
}

function validateProxyEnvironment(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  if (!trustedProxies(env).length) throw new Error('Configure TRUST_PROXY com os IPs reais do proxy.');
  const host = env.LISTEN_HOST || '127.0.0.1';
  if (!net.isIP(host) || host === '0.0.0.0' || host === '::') throw new Error('LISTEN_HOST deve ser um IP especifico, sem bind universal.');
}

module.exports = { trustedProxies, configureProxy, validateProxyEnvironment };
