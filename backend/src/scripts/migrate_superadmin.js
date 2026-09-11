const sqlite3 = require('sqlite3').verbose();
const path = require("node:path");
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, '../../data/courtmanager.sqlite');
const db = new sqlite3.Database(dbPath);

const migrate = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      console.log('Iniciando migração...');

      // 1. Add status to Arenas
      try {
        await new Promise((res, rej) => {
          db.run("ALTER TABLE Arenas ADD COLUMN status INTEGER DEFAULT 1;", (err) => {
            if (err && !err.message.includes('duplicate column')) {
              console.log('Aviso ao alterar Arenas:', err.message);
            }
            res();
          });
        });
        console.log('Coluna status garantida em Arenas.');
      } catch(e) {}

      // 2. Recreate Usuarios for CHECK constraint
      db.run("PRAGMA foreign_keys=off;");
      db.run("BEGIN TRANSACTION;");
      
      db.run(`
        CREATE TABLE Usuarios_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER,
          cliente_id INTEGER,
          nome TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          senha_hash TEXT NOT NULL,
          perfil TEXT CHECK(perfil IN ('Administrador', 'Gerente', 'Recepcionista', 'Cliente', 'SuperAdmin')) NOT NULL,
          ativo INTEGER DEFAULT 1,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES Arenas(id),
          FOREIGN KEY (cliente_id) REFERENCES Clientes(id)
        )
      `);

      db.run(`INSERT INTO Usuarios_new SELECT * FROM Usuarios;`, (err) => {
        if(err) console.error('Erro ao copiar usuários:', err);
      });
      db.run(`DROP TABLE Usuarios;`);
      db.run(`ALTER TABLE Usuarios_new RENAME TO Usuarios;`);
      db.run(`COMMIT;`);
      db.run("PRAGMA foreign_keys=on;");

      console.log('Tabela Usuarios recriada com sucesso.');

      // 3. Create SuperAdmin default user
      const senha_hash = await bcrypt.hash('admin123', 12);
      db.run(
        `INSERT INTO Usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)`,
        ['Super Administrador', 'admin@courtmanager.com', senha_hash, 'SuperAdmin'],
        (err) => {
          if (err && err.message.includes('UNIQUE')) {
            console.log('SuperAdmin já existe.');
          } else if (err) {
            console.error('Erro ao criar SuperAdmin:', err.message);
          } else {
            console.log('SuperAdmin admin@courtmanager.com (senha: admin123) criado.');
          }
          resolve();
        }
      );
    });
  });
};

migrate().then(() => {
  console.log('Migração finalizada.');
  db.close();
});
