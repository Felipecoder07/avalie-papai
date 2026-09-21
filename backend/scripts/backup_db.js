process.umask(0o077);
const db = require('../src/config/database');
const fs = require('fs');
const path = require('path');
const logger = require('../src/utils/safeLogger').forModule('backup_db');

const backupDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(__dirname, '../../data/backups');

const backupDb = async () => {
  try {
    process.umask(0o077);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup_${timestamp}.sqlite`);

    logger.log(`Iniciando backup para: ${backupFile}`);

    // SQLite 'VACUUM INTO' cria uma cópia atômica consistente do banco de dados, sem bloqueios prolongados.
    await db.runAsync(`VACUUM INTO ?`, [backupFile]);
    fs.chmodSync(backupFile, 0o600);

    logger.log(`Backup criado com sucesso: ${backupFile}`);
    process.exit(0);
  } catch (error) {
    logger.error(`Falha ao criar backup: ${error.message}`);
    process.exit(1);
  }
};

backupDb();
