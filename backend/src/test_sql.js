const sqlite3 = require('sqlite3').verbose();
const path = require("node:path");
const db = new sqlite3.Database(path.resolve(__dirname, '../data/courtmanager.sqlite'));

db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='Usuarios'", (err, row) => {
  console.log(row.sql);
});
