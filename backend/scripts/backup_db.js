const db = require('../src/config/database');
const fs = require('fs');
const path = require('path');
const logger = require('../src/utils/safeLogger').forModule('backup_db');

const backupDir = path.join(__dirname, '../../data/backups');

const backupDb = async () => {
  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup_${timestamp}.sqlite`);

    logger.log(`Iniciando backup para: ${backupFile}`);

    // SQLite 'VACUUM INTO' cria uma cópia atômica consistente do banco de dados, sem bloqueios prolongados.
    await db.runAsync(`VACUUM INTO ?`, [backupFile]);

    logger.log(`Backup criado com sucesso: ${backupFile}`);
    process.exit(0);
  } catch (error) {
    logger.error(`Falha ao criar backup: ${error.message}`);
    process.exit(1);
  }
};

backupDb();
