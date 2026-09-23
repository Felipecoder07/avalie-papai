// The public tunnel reaches only webhook routes, never the UI, login or files.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const evidence = path.resolve(__dirname, '../../.local-security/homologacao/webhook-receipts.jsonl');
const allowed = new Set(['/api/pagamentos/gateway/webhook', '/api/saas/webhook-pagamento']);
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'POST' || !allowed.has(url.pathname)) { res.writeHead(404).end(); return; }
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 262144) { res.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const headers = { 'Content-Type': 'application/json' };
    for (const key of ['x-signature', 'x-request-id']) if (req.headers[key]) headers[key] = req.headers[key];
    const upstream = await fetch('http://127.0.0.1:3100' + url.pathname + url.search, {
      method: 'POST', headers, body: Buffer.concat(chunks), signal: AbortSignal.timeout(25000), redirect: 'error',
    });
    const body = await upstream.text();
    let event = {};
    try { event = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* Invalid JSON is rejected by the application. */ }
    const id = String(event.data?.id || url.searchParams.get('data.id') || '');
    const action = String(event.action || '');
    fs.appendFileSync(evidence, JSON.stringify({ at: new Date().toISOString(), path: url.pathname, status: upstream.status,
      paymentId: /^\d{1,30}$/.test(id) ? id : undefined,
      action: /^[a-z_.]{1,60}$/i.test(action) ? action : undefined,
      signaturePresent: Boolean(req.headers['x-signature']) }) + '\n');
    res.writeHead(upstream.status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(503).end('Retry'); }
}).listen(3110, '127.0.0.1', () => console.log('Webhook-only relay: http://127.0.0.1:3110'));
