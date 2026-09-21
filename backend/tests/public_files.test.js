const express = require('express');
const request = require('supertest');
const { protectPublicFiles } = require('../src/middlewares/publicFiles');
const app = express();
app.use(protectPublicFiles);
app.use((req, res) => res.send('application'));

it.each(['/.env', '/%2eenv', '/assets/bundle.js.map', '/backup.sqlite-wal', '/db.sqlite3', '/BACKUPS/snapshot', '/data/report.json', '/package.json', '/backend/src/server.js'])('blocks sensitive path %s before static files or SPA fallback', async file => {
  expect((await request(app).get(file)).status).toBe(404);
});
it.each(['/api/health', '/assets/app.js', '/uploads/photo.webp', '/arena/test-arena', '/api/public/tenant/data/disponibilidade'])('preserves application path %s', async file => {
  expect((await request(app).get(file)).status).toBe(200);
});
