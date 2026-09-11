const sqlite3 = require('sqlite3').verbose();
const path = require("node:path");
const fs = require("node:fs");

const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const isTest = process.env.NODE_ENV === 'test';
const dbFile = isTest ? 'courtmanager_test.sqlite' : 'courtmanager.sqlite';
const dbPath = path.resolve(__dirname, '../../data', dbFile);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar com o banco de dados:', err.message);
  } else {
    if (!isTest) {
      console.log('Conectado ao banco de dados SQLite.');
    }
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

module.exports = db;
