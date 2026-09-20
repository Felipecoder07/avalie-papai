const db = require('./database');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/safeLogger').forModule('migrate');

const migrationsDir = path.join(__dirname, 'migrations');

async function runMigrations() {
  try {
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS _Migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    if (!fs.existsSync(migrationsDir)) {
      logger.warn('Diretório de migrações não encontrado. Criando...');
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const row = await db.getAsync(`SELECT * FROM _Migrations WHERE name = ?`, [file]);
      if (!row) {
        logger.log(`Executando migração: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        
        // SQLite exige foreign_keys = OFF para recriar tabelas sem quebrar dependências
        await db.runAsync('PRAGMA foreign_keys=OFF');
        await db.runAsync('BEGIN TRANSACTION');
        try {
          // sqlite3 não roda multi-statement bem via 'run', precisamos separar por ';'
          // mas como sqlite3 driver é limitado, vamos rodar stmt por stmt se houver quebras.
          // O melhor para scripts SQL complexos é usar o execAsync.
          await new Promise((resolve, reject) => {
            db.exec(sql, (err) => {
              if (err) return reject(err);
              resolve();
            });
          });

          await db.runAsync(`INSERT INTO _Migrations (name) VALUES (?)`, [file]);
          await db.runAsync('COMMIT');
          await db.runAsync('PRAGMA foreign_keys=ON');
          logger.log(`Migração ${file} concluída com sucesso.`);
        } catch (err) {
          await db.runAsync('ROLLBACK');
          await db.runAsync('PRAGMA foreign_keys=ON');
          logger.error(`Erro na migração ${file}: ${err.message}`);
          console.error(err);
          throw err;
        }
      }
    }
    
    logger.log('Todas as migrações foram aplicadas.');
    process.exit(0);
  } catch (error) {
    logger.error(`Erro fatal no processo de migração: ${error.message}`);
    process.exit(1);
  }
}

// Permitir executar diretamente
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
