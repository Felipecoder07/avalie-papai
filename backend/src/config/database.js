const logger = require('../utils/safeLogger').forModule('database');
const sqlite3 = require('sqlite3').verbose();
const path = require("node:path");
const fs = require("node:fs");

const isTest = process.env.NODE_ENV === 'test';
// Test fixtures must never open a persistent application database, even when
// TEST_DB_PATH was inherited from a developer's shell or a CI configuration.
if (process.env.VITEST && !isTest) throw new Error('Initialize the test database before switching environment branches.');
if (isTest && process.env.TEST_DB_PATH && process.env.TEST_DB_PATH !== ':memory:') {
  throw new Error('Test databases must use SQLite :memory:. Persistent TEST_DB_PATH is forbidden.');
}
const dataDir = path.resolve(__dirname, '../../data');
if (!isTest && !fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = isTest ? ':memory:' : path.join(dataDir, 'courtmanager.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Erro ao conectar com o banco de dados:', err.message);
  } else {
    if (!isTest) {
      logger.log('Conectado ao banco de dados SQLite.');
    }
    // Habilitar Foreign Keys em todas as conexões
    db.run('PRAGMA foreign_keys = ON', (pragmaErr) => {
      if (pragmaErr) logger.error('Erro ao habilitar foreign keys:', pragmaErr.message);
    });
  }
});

// Promisify helpers
db.getAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    this.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

db.allAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    this.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

db.runAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    this.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this); // this contém lastID e changes
    });
  });
};

db.configure('busyTimeout', 5000);
require('../utils/transactions').installTransactions(db);
module.exports = db;
