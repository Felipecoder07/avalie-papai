const sqlite3 = require('sqlite3').verbose();
const path = require("node:path");
const db = new sqlite3.Database(path.resolve(__dirname, '../data/courtmanager.sqlite'));
db.all("SELECT id, hora_inicio, hora_fim FROM Reservas WHERE quadra_id = 1 AND data_reserva = '2026-07-19' AND status != 'Cancelada' AND tenant_id = 1 AND (hora_inicio < '19:00' AND hora_fim > '17:00')", (err, rows) => {
  if (err) console.error(err);
  console.log(JSON.stringify(rows, null, 2));
});
