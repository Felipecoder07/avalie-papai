const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPORT_SCHEMA_VERSION = 2;
const DEFAULT_REPORT_PATH = path.resolve(__dirname, '../../data/inconsistencies_report.json');

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function reportIdentity(report) {
  const content = { ...report };
  delete content.generated_at;
  delete content.report_id;
  return crypto.createHash('sha256').update(stableJson(content)).digest('hex');
}

async function groupMembers(database, tenantId, groupId) {
  return database.allAsync(`
    SELECT r.id AS reserva_id,
           r.valor_total,
           COALESCE(p.valor_pago, 0) AS valor_pago,
           COALESCE(p.quantidade, 0) AS quantidade_pagamentos
    FROM Reservas r
    LEFT JOIN (
      SELECT reserva_id, SUM(valor) AS valor_pago, COUNT(*) AS quantidade
      FROM Pagamentos
      GROUP BY reserva_id
    ) p ON p.reserva_id = r.id
    WHERE r.tenant_id = ? AND r.grupo_id = ?
    ORDER BY r.id
  `, [tenantId, groupId]);
}

async function findInconsistentGroups(database) {
  const groups = await database.allAsync(`
    SELECT r.tenant_id,
           r.grupo_id,
           SUM(r.valor_total) AS valor_reservas,
           SUM(COALESCE(p.valor_pago, 0)) AS valor_pago,
           SUM(COALESCE(p.valor_pago, 0)) - SUM(r.valor_total) AS diferenca,
           COUNT(*) AS quantidade_reservas
    FROM Reservas r
    LEFT JOIN (
      SELECT reserva_id, SUM(valor) AS valor_pago
      FROM Pagamentos
      GROUP BY reserva_id
    ) p ON p.reserva_id = r.id
    WHERE r.grupo_id IS NOT NULL AND TRIM(r.grupo_id) != ''
    GROUP BY r.tenant_id, r.grupo_id
    HAVING SUM(COALESCE(p.valor_pago, 0)) > SUM(r.valor_total)
    ORDER BY r.tenant_id, r.grupo_id
  `);

  return Promise.all(groups.map(async group => ({
    ...group,
    tipo: 'pagamento_acima_do_valor_do_grupo',
    acao_recomendada: 'conciliacao_manual',
    reservas: await groupMembers(database, group.tenant_id, group.grupo_id)
  })));
}

async function collectReport(database) {
  const [duplicates, orphanPayments, superAdmins, defaultSecrets, crossTenantLinks, inconsistentGroups] = await Promise.all([
    database.allAsync(`
      SELECT LOWER(TRIM(email)) AS email_normalizado,
             COUNT(*) AS quantidade,
             GROUP_CONCAT(id) AS usuarios,
             GROUP_CONCAT(COALESCE(tenant_id, 'NULL')) AS tenants
      FROM Usuarios
      WHERE email IS NOT NULL AND TRIM(email) != ''
      GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*) > 1
      ORDER BY email_normalizado
    `),
    database.allAsync(`
      SELECT p.id, p.valor, p.reserva_id
      FROM Pagamentos p
      LEFT JOIN Reservas r ON r.id = p.reserva_id
      WHERE r.id IS NULL
      ORDER BY p.id
    `),
    database.allAsync(`
      SELECT id, nome, email, criado_em
      FROM Usuarios
      WHERE perfil = 'SuperAdmin'
      ORDER BY id
    `),
    database.allAsync(`
      SELECT id, email, perfil
      FROM Usuarios
      WHERE two_factor_secret IN ('123456', 'padrao')
      ORDER BY id
    `),
    database.allAsync(`
      SELECT 'usuario_cliente' AS tipo,
             u.id AS origem_id,
             u.tenant_id AS tenant_origem,
             c.id AS destino_id,
             c.tenant_id AS tenant_destino
      FROM Usuarios u
      JOIN Clientes c ON c.id = u.cliente_id
      WHERE u.tenant_id IS NOT NULL AND u.tenant_id != c.tenant_id
      UNION ALL
      SELECT 'reserva_cliente', r.id, r.tenant_id, c.id, c.tenant_id
      FROM Reservas r
      JOIN Clientes c ON c.id = r.cliente_id
      WHERE r.tenant_id != c.tenant_id
      UNION ALL
      SELECT 'reserva_quadra', r.id, r.tenant_id, q.id, q.tenant_id
      FROM Reservas r
      JOIN Quadras q ON q.id = r.quadra_id
      WHERE r.tenant_id != q.tenant_id
      ORDER BY tipo, origem_id
    `),
    findInconsistentGroups(database)
  ]);

  const report = {
    schema_version: REPORT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    unidade_monetaria: 'centavos',
    duplicidades_usuarios: duplicates,
    vinculos_entre_arenas: crossTenantLinks,
    pagamentos_sem_reserva: orphanPayments,
    grupos_com_saldo_inconsistente: inconsistentGroups,
    contas_superadmin: superAdmins,
    segredos_padrao: defaultSecrets
  };
  report.report_id = reportIdentity(report);
  return report;
}

function writeReport(report, outputPath = DEFAULT_REPORT_PATH) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  try {
    fs.renameSync(temporary, resolved);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  return resolved;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const database = require('../src/config/database');
  const report = await collectReport(database);
  const output = writeReport(report, argument('--output') || DEFAULT_REPORT_PATH);
  console.log(JSON.stringify({
    status: report.grupos_com_saldo_inconsistente.length || report.pagamentos_sem_reserva.length || report.vinculos_entre_arenas.length
      ? 'review_required'
      : 'ok',
    report_id: report.report_id,
    output,
    counts: {
      duplicidades_usuarios: report.duplicidades_usuarios.length,
      vinculos_entre_arenas: report.vinculos_entre_arenas.length,
      pagamentos_sem_reserva: report.pagamentos_sem_reserva.length,
      grupos_com_saldo_inconsistente: report.grupos_com_saldo_inconsistente.length,
      contas_superadmin: report.contas_superadmin.length,
      segredos_padrao: report.segredos_padrao.length
    }
  }));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  REPORT_SCHEMA_VERSION,
  collectReport,
  findInconsistentGroups,
  reportIdentity,
  writeReport
};
