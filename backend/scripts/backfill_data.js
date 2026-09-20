const db = require('../src/config/database');
const fs = require('fs');
const path = require('path');
const logger = require('../src/utils/safeLogger').forModule('backfill_data');
const { recompute } = require('../src/services/paymentLedgerService');

const isDryRun = process.argv.includes('--dry-run');
const reportPath = path.join(__dirname, '../../data/inconsistencies_report.json');

async function runBackfill() {
  if (!fs.existsSync(reportPath)) {
    logger.error('Relatório de inconsistências não encontrado. Rode report_inconsistencies.js primeiro.');
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  
  if (isDryRun) {
    logger.warn('Modo DRY-RUN ativo. Nenhuma alteração será persistida no banco de dados.');
  } else {
    logger.log('Iniciando reconciliação e correção de dados legado...');
  }

  try {
    await db.runAsync('BEGIN TRANSACTION');

    // 1. Grupos Inconsistentes
    if (report.grupos_com_saldo_inconsistente.length > 0) {
      for (const grupo of report.grupos_com_saldo_inconsistente) {
        const diff = grupo.valor_pago - grupo.valor_reservas;
        if (diff !== 0) {
          logger.log(`Ajuste necessário no grupo ${grupo.grupo_id}. Diferença de ${diff}.`);
          if (!isDryRun) {
            // Pega uma reserva do grupo para atrelar o ajuste
            const reserva = await db.getAsync(`SELECT id FROM Reservas WHERE grupo_id = ? LIMIT 1`, [grupo.grupo_id]);
            if (reserva) {
              const duplicado = await db.getAsync(`SELECT id FROM Pagamentos WHERE reserva_id = ? AND metodo = 'Ajuste de Conciliação Legada'`, [reserva.id]);
              if (duplicado) {
                logger.warn(`Ajuste para o grupo ${grupo.grupo_id} já existe. Pulando para garantir idempotência.`);
                continue;
              }

              await db.runAsync(`
                INSERT INTO Pagamentos (reserva_id, valor, metodo, registrado_por)
                VALUES (?, ?, 'Ajuste de Conciliação Legada', NULL)
              `, [reserva.id, -diff]);
              
              await recompute(reserva.id);
              
              await db.runAsync(`
                INSERT INTO LogsAuditoria (evento, detalhes)
                VALUES ('Ajuste Financeiro', ?)
              `, [`Ajuste de conciliação do módulo 6 para grupo ${grupo.grupo_id}: compensado valor de ${diff}`]);
              logger.log(`Ajuste de ${diff} inserido para o grupo ${grupo.grupo_id}`);
            }
          }
        }
      }
    }

    if (isDryRun) {
      await db.runAsync('ROLLBACK');
      logger.warn('DRY-RUN concluído com ROLLBACK.');
    } else {
      await db.runAsync('COMMIT');
      logger.log('Backfill persistido com COMMIT com sucesso.');
    }
    process.exit(0);
  } catch (error) {
    await db.runAsync('ROLLBACK');
    logger.error(`Falha no backfill: ${error.message}`);
    process.exit(1);
  }
}

runBackfill();
