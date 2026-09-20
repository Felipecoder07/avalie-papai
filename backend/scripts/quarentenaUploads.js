const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const logger = require('../src/utils/safeLogger').forModule('quarentenaUploads');

const uploadsDir = path.join(__dirname, '../uploads');
const quarantineDir = path.join(uploadsDir, 'quarantine');

if (!fs.existsSync(quarantineDir)) {
  fs.mkdirSync(quarantineDir, { recursive: true });
}

async function run() {
  logger.log('Iniciando inventário e quarentena de uploads...');
  
  if (!fs.existsSync(uploadsDir)) {
    logger.log('Diretório de uploads não existe. Nada a fazer.');
    return;
  }

  const files = fs.readdirSync(uploadsDir);
  let quarantinedCount = 0;
  let validCount = 0;

  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    
    // Ignorar subdiretórios como "quarantine"
    if (fs.statSync(filePath).isDirectory()) {
      continue;
    }

    // Extensões permitidas básicas
    const ext = path.extname(file).toLowerCase();
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

    if (!validExtensions.includes(ext)) {
      logger.warn(`[Quarentena] Extensão não permitida: ${file}`);
      moveToQuarantine(filePath, file);
      quarantinedCount++;
      continue;
    }

    try {
      // Verificar integridade e dimensões reais usando o Sharp
      const metadata = await sharp(filePath).metadata();
      
      // Checagem de raster e segurança extra
      if (!metadata.format || !['jpeg', 'png', 'webp', 'jpg'].includes(metadata.format)) {
        logger.warn(`[Quarentena] Formato interno inválido (não é raster seguro): ${file}`);
        moveToQuarantine(filePath, file);
        quarantinedCount++;
        continue;
      }
      
      if (metadata.width > 8000 || metadata.height > 8000) {
        logger.warn(`[Quarentena] Dimensões abusivas: ${file}`);
        moveToQuarantine(filePath, file);
        quarantinedCount++;
        continue;
      }

      validCount++;
    } catch (err) {
      logger.error(`[Quarentena] Arquivo corrompido ou malicioso: ${file}`, err.message);
      moveToQuarantine(filePath, file);
      quarantinedCount++;
    }
  }

  logger.log('-------------------------------------------');
  logger.log(`Resumo da Quarentena:`);
  logger.log(`Arquivos validados e seguros: ${validCount}`);
  logger.log(`Arquivos movidos para quarentena: ${quarantinedCount}`);
  logger.log('-------------------------------------------');
}

function moveToQuarantine(filePath, fileName) {
  const dest = path.join(quarantineDir, fileName);
  try {
    fs.renameSync(filePath, dest);
  } catch (err) {
    logger.error(`Erro ao mover arquivo ${fileName} para quarentena`, err);
  }
}

run();
