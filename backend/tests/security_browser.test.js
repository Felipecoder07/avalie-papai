const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const fixture = require('./helpers/securityFixture.cjs');
const { db } = fixture;
vi.spyOn(require('../src/services/emailService'),'sendEmail').mockResolvedValue(true);
let server, vite, browser, context, page, origin;

beforeAll(async () => {
  await fixture.initialize();
  const frontend = path.resolve(__dirname, '../../frontend');
  const { createServer } = await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
  const { default: react } = await import(pathToFileURL(path.join(frontend,'node_modules/@vitejs/plugin-react/dist/index.mjs')).href);
  vite = await createServer({root:frontend,configFile:false,envFile:false,plugins:[react()],
    server:{middlewareMode:true,hmr:false,host:'127.0.0.1'},logLevel:'error'});
  let app;
  server = http.createServer((req,res) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) app(req,res);
    else vite.middlewares(req,res);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  origin = 'http://127.0.0.1:'+server.address().port;
  process.env.CORS_ALLOWED_ORIGINS = origin;
  app = require('../src/app');
  // Use the installed Edge on Windows; CI can install Chromium via Playwright.
  const channel = process.env.SECURITY_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
  browser = await chromium.launch({headless:true,...(channel ? {channel} : {})});
}, 60000);
beforeEach(async () => {
  await fixture.seed();
  context = await browser.newContext();
  // No third-party fonts, analytics, identity or payment traffic from tests.
  await context.route('**/*',route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const response = await context.request.post(origin+'/api/auth/login',{data:{email:'u1@example.test',senha:fixture.PASSWORD}});
  expect(response.status()).toBe(200);
  const user = (await response.json()).usuario;
  await context.addInitScript(user => {
    localStorage.setItem('courtmanager_token','session');
    localStorage.setItem('courtmanager_user',encodeURIComponent(JSON.stringify(user)));
    window.__securityXss = 0;
  },user);
  page = await context.newPage();
});
afterEach(async () => { await context?.close(); });
afterAll(async () => {
  await browser?.close();
  await vite?.close();
  if (server?.listening) await new Promise((resolve,reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
  await fixture.close();
},30000);

it('stored client markup is rendered as text in the actual administrative page',async()=>{
  const payload = '<img src=x onerror="window.__securityXss=1"> Security Fixture';
  const cookies = await context.cookies(origin);
  const csrf = cookies.find(cookie => cookie.name === 'cm_csrf').value;
  const created = await context.request.post(origin+'/api/clientes',{headers:{'x-csrf-token':csrf},data:{nome:payload,telefone:'(11) 99999-9999',email:'browser-xss@example.test'}});
  expect(created.status()).toBe(201);
  const id = (await created.json()).id;
  expect((await db.getAsync('SELECT nome FROM Clientes WHERE id=?',[id])).nome).toBe(payload);
  const dialogs = [];
  page.on('dialog',async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  const pending = new Set(), errors = [];
  page.on('request',req=>pending.add(req.url()));
  page.on('requestfinished',req=>pending.delete(req.url()));
  page.on('requestfailed',req=>pending.delete(req.url()));
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/admin/clientes',{waitUntil:'commit'});
  try {
    await page.getByText(payload,{exact:true}).waitFor({state:'visible',timeout:30000});
  } catch (error) {
    throw new Error(error.message+'; URL: '+page.url()+'; browser errors: '+JSON.stringify(errors)+'; pending: '+JSON.stringify([...pending])+'; body: '+await page.locator('body').innerText());
  }
  expect(await page.locator('.admin-clientes-page img[src="x"]').count()).toBe(0);
  expect(await page.evaluate(()=>window.__securityXss)).toBe(0);
  expect(dialogs).toEqual([]);
  const exposed = await page.evaluate(()=>({cookies:document.cookie,stored:localStorage.getItem('courtmanager_token')}));
  expect(exposed.cookies).not.toContain('cm_session=');
  expect(exposed.stored).toBe('session');
  expect(cookies.find(cookie=>cookie.name==='cm_session').httpOnly).toBe(true);
  const missingCsrf = await context.request.post(origin+'/api/auth/logout');
  expect(missingCsrf.status()).toBe(403);
},60000);

it('active upload is rejected and navigating to HTML under uploads cannot execute it',async()=>{
  const cookies = await context.cookies(origin);
  const image = 'data:image/html;base64,'+Buffer.from('<script>window.__securityXss=1</script>').toString('base64');
  const response = await context.request.post(origin+'/api/arenas/upload-capa',{
    headers:{'x-csrf-token':cookies.find(cookie=>cookie.name==='cm_csrf').value},data:{image},
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain('Formato permitido');
  // The file really exists: a missing-file 404 would not prove upload filtering.
  const name = 'security-fixture-'+randomUUID()+'.html';
  const target = path.resolve(__dirname,'../uploads',name);
  await fs.copyFile(path.join(__dirname,'fixtures/active-upload.html'),target,constants.COPYFILE_EXCL);
  try {
    const navigation = await page.goto(origin+'/uploads/'+name);
    expect(navigation.status()).toBe(404);
    expect(navigation.headers()['x-content-type-options']).toBe('nosniff');
    expect(await page.evaluate(()=>window.__securityXss)).toBe(0);
  } finally {
    // Remove only the uniquely named file created by this test.
    await fs.unlink(target);
  }
});
