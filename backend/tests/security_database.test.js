const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const db = require('../src/config/database');

afterAll(() => new Promise(resolve => db.close(resolve)));
it('each suite starts with an empty in-memory database',async()=>{
  const databases = await db.allAsync('PRAGMA database_list');
  expect(databases.find(row=>row.name==='main').file).toBe('');
  expect(await db.allAsync("SELECT name FROM sqlite_master WHERE type='table'")).toEqual([]);
});
it('a persistent TEST_DB_PATH is rejected before SQLite can open it',()=>{
  const script = "try { require('./src/config/database'); process.exit(2); } catch(error) { if(!error.message.includes('Persistent TEST_DB_PATH is forbidden')) throw error; }";
  const result = spawnSync(process.execPath,['-e',script],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'test',TEST_DB_PATH:path.resolve(__dirname,'../data/courtmanager.sqlite')},encoding:'utf8'});
  expect(result.error).toBeUndefined();
  expect(result.status,result.stderr).toBe(0);
});
it.each([
  ['docs/security-audit-evidence.json','bf9f742c002515177d55c6efcb89050ddc231054d4f11c4b8f61cff138f6d430'],
  ['docs/security-review-2026-09-13.md','2d952de8544aeb84f06cf57cdcab30699967b87d25bb817f3db44d2d3d401e19'],
  ['backend/tests/security_audit_review.cjs','654393c6c1c769923b9f74672f1bc9f6acaa36b78ab8d4c33d484771990454d0'],
])('preserves the original audit artifact %s', (file, expected) => {
  // Normalize Git's CRLF/LF checkout conversion without changing the evidence.
  const content = fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8').replace(/\r\n/g,'\n');
  expect(createHash('sha256').update(content).digest('hex')).toBe(expected);
});
