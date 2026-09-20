if (process.env.NODE_ENV !== 'test') throw new Error('Fixture restrita aos testes. Use convite ou recuperação verificada.');
const logger = require('../utils/safeLogger').forModule('migrate_superadmin2');
const path = require("node:path");
const bcrypt = require('bcrypt');
const db = require('../config/database');

const migrate = async () => {
  logger.log('Iniciando migração segura...');

  // 1. Add status to Arenas
  try {
    await db.runAsync("ALTER TABLE Arenas ADD COLUMN status INTEGER DEFAULT 1;");
    logger.log('Coluna status garantida em Arenas.');
  } catch (e) {
    if (!e.message.includes('duplicate column')) {
      logger.log('Aviso ao alterar Arenas:', e.message);
    } else {
      logger.log('Coluna status já existe em Arenas.');
    }
  }

  // 2. Recreate Usuarios for CHECK constraint
  try {
    await db.runAsync("PRAGMA foreign_keys=off;");
    await db.runAsync("BEGIN TRANSACTION;");
    
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS Usuarios_new (
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

    await db.runAsync("INSERT INTO Usuarios_new SELECT * FROM Usuarios;");
    await db.runAsync("DROP TABLE Usuarios;");
    await db.runAsync("ALTER TABLE Usuarios_new RENAME TO Usuarios;");
    await db.runAsync("COMMIT;");
    await db.runAsync("PRAGMA foreign_keys=on;");

    logger.log('Tabela Usuarios recriada com sucesso.');
  } catch (err) {
    await db.runAsync("ROLLBACK;");
    logger.error('Erro na recriação da tabela Usuarios:', err.message);
    return;
  }

  // 3. Create SuperAdmin default user
  try {
    const senha_hash = await bcrypt.hash('admin123', 12);
    await db.runAsync(
      `INSERT INTO Usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)`,
      ['Super Administrador', 'master@courtmanager.com', senha_hash, 'SuperAdmin']
    );
    logger.log('SuperAdmin master@courtmanager.com (senha: admin123) criado.');
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      logger.log('SuperAdmin já existe.');
    } else {
      logger.error('Erro ao criar SuperAdmin:', err.message);
    }
  }
};

migrate().then(() => {
  logger.log('Migração finalizada.');
  process.exit(0);
});
