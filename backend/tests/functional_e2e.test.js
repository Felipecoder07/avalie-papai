const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const fixture = require('./helpers/securityFixture.cjs');
const { db } = fixture;
vi.spyOn(require('../src/services/emailService'), 'sendEmail').mockResolvedValue(true);

const sites = [];
let app, browser, context, page;
async function serve(directory) {
  const root = path.resolve(__dirname, '../..', directory);
  const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);
  const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react', { paths: [root] })).href);
  const { default: tailwindConfig } = await import(pathToFileURL(path.join(root, 'tailwind.config.js')).href);
  const tailwind = require(require.resolve('tailwindcss', { paths: [root] }));
  let vite;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) app(req, res);
    else vite.middlewares(req, res);
  });
  vite = await createServer({ root, configFile: false, envFile: false, plugins: [react()],
    css: { postcss: { plugins: [tailwind({ ...tailwindConfig, content: [path.join(root, 'index.html').replaceAll('\\', '/'), path.join(root, 'src/**/*.{js,ts,jsx,tsx}').replaceAll('\\', '/')] })] } },
    server: { middlewareMode: true, hmr: { server }, host: '127.0.0.1' }, logLevel: 'error' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  sites.push({ vite, server, origin: 'http://127.0.0.1:' + server.address().port });
}
beforeAll(async () => {
  await fixture.initialize();
  await serve('frontend');
  await serve('tela cliente');
  process.env.CORS_ALLOWED_ORIGINS = sites.map(site => site.origin).join(',');
  app = require('../src/app');
  const channel = process.env.SECURITY_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
  browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
}, 60000);
beforeEach(async () => {
  await fixture.seed();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('External requests disabled in E2E.')));
  context = await browser.newContext({ timezoneId: 'America/Sao_Paulo' });
  await context.route('**/*', route => sites.some(site => new URL(route.request().url()).origin === site.origin)
    ? route.continue() : route.abort());
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  // The first navigation compiles both Vite applications on a cold cache. Keep
  // UI assertions at 15s, but allow that initial module compilation to finish.
  page.setDefaultNavigationTimeout(45000);
});
afterEach(async () => { await context?.close(); vi.unstubAllGlobals(); });
afterAll(async () => {
  await browser?.close();
  for (const { vite, server } of sites) {
    await vite.close();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
  await fixture.close();
}, 30000);

it('gestor entra pela tela, consulta clientes e sai com revogacao efetiva', async () => {
  const origin = sites[0].origin;
  await page.goto(origin + '/login');
  await page.getByLabel('E-mail', { exact: true }).fill('u1@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('WrongPassword123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('alert').waitFor();
  expect((await context.cookies()).some(cookie => cookie.name === 'cm_session')).toBe(false);
  await page.getByLabel('Senha', { exact: true }).fill(fixture.PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/admin/dashboard');
  await page.getByRole('link', { name: 'Clientes', exact: true }).click();
  await page.getByText('Owner', { exact: true }).waitFor();
  expect(await page.getByText('Foreign', { exact: true }).count()).toBe(0);
  const cookie = (await context.cookies()).find(item => item.name === 'cm_session');
  expect(cookie.httpOnly).toBe(true);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.waitForURL('**/login');
  const replay = await context.request.get(origin + '/api/auth/me', { headers: { cookie: 'cm_session=' + cookie.value } });
  expect(replay.status()).toBe(401);
}, 60000);

async function athleteCheckout() {
  const origin = sites[1].origin;
  await page.goto(origin + '/arena/arena-a');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByPlaceholder('seu@email.com').fill('u2@example.test');
  await page.getByPlaceholder('Sua Senha (mín. 8 caracteres)').fill(fixture.PASSWORD);
  await page.getByRole('button', { name: 'Entrar e Continuar' }).click();
  await page.getByRole('button', { name: 'Entrar e Continuar' }).waitFor({ state: 'hidden' });
  const dates = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Escolha a data' }) });
  await dates.getByRole('button').nth(1).click();
  await page.getByRole('button', { name: /^08:00/ }).click();
  const sport = page.getByRole('dialog').getByRole('button', { name: /Beach Tennis/ });
  const advance = page.getByRole('button', { name: 'Avançar', exact: true });
  await Promise.race([
    sport.waitFor({ state: 'visible' }),
    advance.waitFor({ state: 'visible' })
  ]);
  if (await sport.isVisible()) await sport.click();
  try {
    await advance.click();
  } catch (error) {
    throw new Error(error.message + '; body: ' + await page.locator('body').innerText());
  }
  await page.locator('input[type="tel"]').fill('11900000001');
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/agendar') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /^Pagar Pix/ }).click();
  const response = await responsePromise;
  const result = await response.json();
  expect(response.status(), result.error).toBe(201);
  await page.getByRole('heading', { name: 'Pagamento Pix' }).waitFor();
  expect(result.valor_total).toBe(100);
  const row = await db.getAsync('SELECT * FROM Reservas WHERE id=?', [result.reserva_id]);
  expect(row.tenant_id).toBe(1);
  expect(row.cliente_id).toBe(1);
  expect(row.valor_total).toBe(10000);
  return result;
}

it('atleta entra, escolhe horario, gera Pix estatico e cancela reserva sem cobranca em processamento', async () => {
  const result = await athleteCheckout();
  const denied = await browser.newContext();
  try {
    const response = await denied.request.get(sites[1].origin + '/api/public/tenant/arena-a/status-reserva/' + result.reserva_id);
    expect([401, 403, 404]).toContain(response.status());
  } finally { await denied.close(); }
  const cancellation = page.waitForResponse(response => response.url().endsWith('/cancelar-pendente'));
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  expect((await cancellation).ok()).toBe(true);
  const row = await db.getAsync('SELECT status FROM Reservas WHERE id=?', [result.reserva_id]);
  expect(row.status).toBe('Cancelada');
  expect(await db.getAsync('SELECT reserva_id FROM BookingCancellations WHERE reserva_id=?', [result.reserva_id])).toBeTruthy();
}, 60000);

it('visitante conclui checkout sem conta e recebe acesso restrito somente ao grupo criado', async () => {
  const origin = sites[1].origin;
  await page.goto(origin + '/arena/arena-a');
  const dates = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Escolha a data' }) });
  await dates.getByRole('button').nth(1).click();
  await page.getByRole('button', { name: /^08:00/ }).click();
  const sport = page.getByRole('dialog').getByRole('button', { name: /Beach Tennis/ });
  const advance = page.getByRole('button', { name: 'Avançar', exact: true });
  await Promise.race([sport.waitFor({ state: 'visible' }), advance.waitFor({ state: 'visible' })]);
  if (await sport.isVisible()) await sport.click();
  await advance.click();

  await page.getByRole('button', { name: 'Continuar como visitante' }).click();
  await page.getByPlaceholder('Ex: João da Silva').fill('Visitante E2E');
  await page.getByPlaceholder('(00) 000000000').fill('11987654321');
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/agendar') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /^Pagar Pix/ }).click();
  const response = await responsePromise;
  const result = await response.json();
  expect(response.status(), result.error).toBe(201);
  await page.getByRole('heading', { name: 'Pagamento Pix' }).waitFor();

  const cookies = await context.cookies();
  const guestCookie = cookies.find(cookie => cookie.name === 'cm_guest');
  const guestCsrf = cookies.find(cookie => cookie.name === 'cm_guest_csrf');
  expect(guestCookie?.httpOnly).toBe(true);
  expect(guestCsrf?.httpOnly).toBe(false);
  expect(cookies.some(cookie => cookie.name === 'cm_session')).toBe(false);

  const booking = await db.getAsync('SELECT id,tenant_id,cliente_id,grupo_id,valor_total FROM Reservas WHERE id=?', [result.reserva_id]);
  const client = await db.getAsync('SELECT nome,ativo FROM Clientes WHERE id=?', [booking.cliente_id]);
  const contact = await db.getAsync('SELECT nome,telefone FROM BookingContacts WHERE tenant_id=? AND grupo_id=?', [booking.tenant_id, booking.grupo_id]);
  expect(booking).toMatchObject({ tenant_id: 1, valor_total: 10000 });
  expect(client).toEqual({ nome: 'Visitante', ativo: 0 });
  expect(contact).toEqual({ nome: 'Visitante E2E', telefone: '(11) 98765-4321' });
  expect(await db.getAsync('SELECT token_hash FROM GuestAccess WHERE tenant_id=? AND grupo_id=?', [booking.tenant_id, booking.grupo_id])).toBeTruthy();

  expect((await context.request.get(`${origin}/api/public/tenant/arena-a/status-reserva/${booking.id}`)).status()).toBe(200);
  expect((await context.request.get(`${origin}/api/public/tenant/arena-a/status-reserva/1`)).status()).toBe(404);
  const noCsrf = await context.request.post(`${origin}/api/public/tenant/arena-a/cancelar-pendente`, { data: { reserva_id: booking.id } });
  expect(noCsrf.status()).toBe(404);
  expect((await db.getAsync('SELECT status FROM Reservas WHERE id=?', [booking.id])).status).toBe('Pendente');

  const isolated = await browser.newContext();
  try {
    expect((await isolated.request.get(`${origin}/api/public/tenant/arena-a/status-reserva/${booking.id}`)).status()).toBe(404);
  } finally {
    await isolated.close();
  }

  const cancellation = page.waitForResponse(cancelResponse => cancelResponse.url().endsWith('/cancelar-pendente'));
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  expect((await cancellation).ok()).toBe(true);
  expect((await db.getAsync('SELECT status FROM Reservas WHERE id=?', [booking.id])).status).toBe('Cancelada');
}, 60000);

it.each(['aprovacao', 'desistencia'])('checkout com provedor simulado: %s', async scenario => {
  await db.runAsync("UPDATE Arenas SET gateway_access_token='FIXTURE-ARENA-TOKEN', gateway_user_id='123' WHERE id=1");
  let approved = false;
  const provider = vi.fn(async (url, options = {}) => {
    if (url === 'https://api.mercadopago.com/v1/payments' && options.method === 'POST') {
      expect(JSON.parse(options.body).transaction_amount).toBe(100);
      return { ok: true, json: async () => ({ id: 991, point_of_interaction: { transaction_data: {
        qr_code: 'fixture-pix', qr_code_base64: ''
      } } }) };
    }
    if (url === 'https://api.mercadopago.com/v1/payments/991') {
      return { ok: true, json: async () => ({ id: 991, status: approved ? 'approved' : 'pending', transaction_amount: 100, currency_id: 'BRL', collector_id: '123' }) };
    }
    throw new Error('Unexpected external request: ' + url);
  });
  vi.stubGlobal('fetch', provider);
  const result = await athleteCheckout();
  expect(result.gateway_ref).toBe('991');
  if (scenario === 'desistencia') {
    const cancellation = page.waitForResponse(response => response.url().endsWith('/cancelar-pendente'));
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    expect((await cancellation).ok()).toBe(true);
    expect((await db.getAsync('SELECT status FROM Reservas WHERE id=?', [result.reserva_id])).status).toBe('Cancelamento pendente');
    expect(await db.getAsync('SELECT COUNT(*) AS count FROM Pagamentos WHERE reserva_id=?', [result.reserva_id])).toEqual({ count: 0 });
    return;
  }
  approved = true;
  expect((await fixture.signedWebhook(app, 991)).status).toBe(200);
  expect((await fixture.signedWebhook(app, 991)).status).toBe(200);
  await page.getByRole('heading', { name: 'Reserva Garantida!' }).waitFor();
  expect(await db.getAsync('SELECT COUNT(*) AS count, SUM(valor) AS total FROM Pagamentos WHERE reserva_id=?', [result.reserva_id]))
    .toEqual({ count: 1, total: 10000 });
  expect((await db.getAsync('SELECT status_pagamento FROM Reservas WHERE id=?', [result.reserva_id])).status_pagamento).toBe('Pago');
  await page.getByRole('button', { name: 'Ver Minhas Reservas', exact: true }).click();
  expect(await db.getAsync('SELECT reserva_id FROM BookingCancellations WHERE reserva_id=?', [result.reserva_id])).toBeUndefined();
}, 60000);
