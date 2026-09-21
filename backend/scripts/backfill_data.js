const fs = require('node:fs');
const path = require('node:path');
const {
  REPORT_SCHEMA_VERSION,
  findInconsistentGroups,
  reportIdentity
} = require('./report_inconsistencies');

const DEFAULT_REPORT_PATH = path.resolve(__dirname, '../../data/inconsistencies_report.json');
const DEFAULT_PLAN_PATH = path.resolve(__dirname, '../../data/backfill_plan.json');
const APPLICATION_METHOD = 'Ajuste de Conciliacao Aprovado';

function assertValidReport(report) {
  if (!report || report.schema_version !== REPORT_SCHEMA_VERSION) {
    throw new Error(`Relatorio incompativel. Gere novamente com schema_version=${REPORT_SCHEMA_VERSION}.`);
  }
  if (!report.report_id || report.report_id !== reportIdentity(report)) {
    throw new Error('Relatorio alterado ou corrompido: report_id invalido.');
  }
  if (!Array.isArray(report.grupos_com_saldo_inconsistente)) {
    throw new Error('Relatorio invalido: grupos_com_saldo_inconsistente ausente.');
  }
}

function sameAmount(left, right) {
  return Number(left) === Number(right);
}

async function planBackfill(database, report) {
  assertValidReport(report);
  const currentGroups = await findInconsistentGroups(database);
  const currentByKey = new Map(currentGroups.map(group => [`${group.tenant_id}:${group.grupo_id}`, group]));
  const reviews = report.grupos_com_saldo_inconsistente.map(saved => {
    const key = `${saved.tenant_id}:${saved.grupo_id}`;
    const current = currentByKey.get(key);
    if (!current) {
      return {
        tenant_id: saved.tenant_id,
        grupo_id: saved.grupo_id,
        status: 'stale_or_resolved',
        reason: 'O grupo nao apresenta mais o mesmo pagamento excedente. Gere um novo relatorio.'
      };
    }
    if (!sameAmount(current.valor_reservas, saved.valor_reservas) ||
        !sameAmount(current.valor_pago, saved.valor_pago) ||
        !sameAmount(current.diferenca, saved.diferenca)) {
      return {
        tenant_id: saved.tenant_id,
        grupo_id: saved.grupo_id,
        status: 'stale',
        reason: 'Os totais mudaram depois da geracao do relatorio. Gere um novo relatorio.',
        reportado: {
          valor_reservas: saved.valor_reservas,
          valor_pago: saved.valor_pago,
          diferenca: saved.diferenca
        },
        atual: {
          valor_reservas: current.valor_reservas,
          valor_pago: current.valor_pago,
          diferenca: current.diferenca
        }
      };
    }
    return {
      tenant_id: current.tenant_id,
      grupo_id: current.grupo_id,
      status: 'manual_review_required',
      reason: 'A distribuicao ou origem do pagamento deve ser conciliada antes de qualquer ajuste contabil.',
      valor_reservas: current.valor_reservas,
      valor_pago: current.valor_pago,
      diferenca: current.diferenca,
      reservas: current.reservas
    };
  });

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_report_id: report.report_id,
    mode: 'dry_run',
    database_changes: 0,
    status: reviews.length ? 'manual_review_required' : 'nothing_to_apply',
    reviews,
    automatic_actions: []
  };
}

function decisionIdentity(reportId, approvedBy, decision) {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(JSON.stringify({
    report_id: reportId,
    approved_by: approvedBy,
    tenant_id: decision.tenant_id,
    grupo_id: decision.grupo_id,
    reserva_id: decision.reserva_id,
    amount_cents: decision.amount_cents,
    reason: decision.reason
  })).digest('hex');
}

function validateApprovals(report, approvals) {
  if (!approvals || approvals.schema_version !== 1 || approvals.source_report_id !== report.report_id) {
    throw new Error('Arquivo de decisoes incompativel com o relatorio informado.');
  }
  if (!Number.isInteger(approvals.approved_by) || approvals.approved_by <= 0) {
    throw new Error('approved_by deve identificar um SuperAdmin valido.');
  }
  if (!Array.isArray(approvals.decisions) || approvals.decisions.length === 0) {
    throw new Error('Nenhuma decisao de conciliacao foi informada.');
  }
  const reservationKeys = new Set();
  for (const decision of approvals.decisions) {
    if (!Number.isInteger(decision.tenant_id) || !decision.grupo_id || !Number.isInteger(decision.reserva_id) ||
        !Number.isInteger(decision.amount_cents) || decision.amount_cents <= 0 ||
        typeof decision.reason !== 'string' || decision.reason.trim().length < 10) {
      throw new Error('Decisao invalida: tenant, grupo, reserva, valor inteiro positivo e justificativa sao obrigatorios.');
    }
    const key = `${decision.tenant_id}:${decision.grupo_id}:${decision.reserva_id}`;
    if (reservationKeys.has(key)) throw new Error('Existe mais de uma decisao para a mesma reserva.');
    reservationKeys.add(key);
  }
}

async function applyApprovedBackfill(database, report, approvals, options = {}) {
  assertValidReport(report);
  validateApprovals(report, approvals);
  const recomputeReservation = options.recomputeReservation || require('../src/services/paymentLedgerService').recompute;
  const decisions = approvals.decisions.map(decision => ({
    ...decision,
    decision_id: decisionIdentity(report.report_id, approvals.approved_by, decision)
  }));

  await database.runAsync('BEGIN IMMEDIATE TRANSACTION');
  try {
    await database.runAsync(`
      CREATE TABLE IF NOT EXISTS BackfillApplications (
        decision_id TEXT PRIMARY KEY,
        source_report_id TEXT NOT NULL,
        tenant_id INTEGER NOT NULL,
        grupo_id TEXT NOT NULL,
        reserva_id INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        approved_by INTEGER NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const placeholders = decisions.map(() => '?').join(',');
    const applied = await database.allAsync(
      `SELECT decision_id FROM BackfillApplications WHERE decision_id IN (${placeholders})`,
      decisions.map(decision => decision.decision_id)
    );
    if (applied.length === decisions.length) {
      await database.runAsync('COMMIT');
      return { status: 'already_applied', database_changes: 0, decision_ids: decisions.map(item => item.decision_id) };
    }
    if (applied.length > 0) throw new Error('Arquivo parcialmente aplicado. Revise as decisoes antes de continuar.');

    const operator = await database.getAsync(
      "SELECT id FROM Usuarios WHERE id = ? AND perfil = 'SuperAdmin' AND ativo = 1",
      [approvals.approved_by]
    );
    if (!operator) throw new Error('O aprovador nao e um SuperAdmin ativo.');

    const currentGroups = await findInconsistentGroups(database);
    const currentByKey = new Map(currentGroups.map(group => [`${group.tenant_id}:${group.grupo_id}`, group]));
    const reportByKey = new Map(report.grupos_com_saldo_inconsistente.map(group => [`${group.tenant_id}:${group.grupo_id}`, group]));
    const decisionsByGroup = new Map();
    for (const decision of decisions) {
      const key = `${decision.tenant_id}:${decision.grupo_id}`;
      if (!decisionsByGroup.has(key)) decisionsByGroup.set(key, []);
      decisionsByGroup.get(key).push(decision);
    }

    for (const [key, groupDecisions] of decisionsByGroup) {
      const saved = reportByKey.get(key);
      const current = currentByKey.get(key);
      if (!saved || !current || !sameAmount(current.valor_reservas, saved.valor_reservas) ||
          !sameAmount(current.valor_pago, saved.valor_pago) || !sameAmount(current.diferenca, saved.diferenca)) {
        throw new Error(`O grupo ${key} mudou depois do relatorio. Gere um novo relatorio.`);
      }
      const approvedTotal = groupDecisions.reduce((sum, decision) => sum + decision.amount_cents, 0);
      if (approvedTotal !== Number(current.diferenca)) {
        throw new Error(`As decisoes do grupo ${key} devem totalizar exatamente ${current.diferenca} centavos.`);
      }
      const members = new Map(current.reservas.map(reservation => [Number(reservation.reserva_id), reservation]));
      for (const decision of groupDecisions) {
        const reservation = members.get(decision.reserva_id);
        if (!reservation || decision.amount_cents > Number(reservation.valor_pago)) {
          throw new Error(`A decisao da reserva ${decision.reserva_id} nao corresponde ao saldo atual do grupo.`);
        }
      }
    }

    for (const decision of decisions) {
      await database.runAsync(
        'INSERT INTO Pagamentos(reserva_id, valor, metodo, registrado_por) VALUES(?, ?, ?, ?)',
        [decision.reserva_id, -decision.amount_cents, APPLICATION_METHOD, approvals.approved_by]
      );
      await database.runAsync(`
        INSERT INTO BackfillApplications(
          decision_id, source_report_id, tenant_id, grupo_id, reserva_id, amount_cents, approved_by
        ) VALUES(?, ?, ?, ?, ?, ?, ?)
      `, [
        decision.decision_id,
        report.report_id,
        decision.tenant_id,
        decision.grupo_id,
        decision.reserva_id,
        decision.amount_cents,
        approvals.approved_by
      ]);
      await recomputeReservation(decision.reserva_id);
      await database.runAsync(`
        INSERT INTO LogsAuditoria(tenant_id, usuario_id, evento, detalhes)
        VALUES(?, ?, 'BackfillFinanceiroAprovado', ?)
      `, [decision.tenant_id, approvals.approved_by, JSON.stringify({
        decision_id: decision.decision_id,
        source_report_id: report.report_id,
        grupo_id: decision.grupo_id,
        reserva_id: decision.reserva_id,
        amount_cents: decision.amount_cents,
        reason: decision.reason.trim()
      })]);
    }

    await database.runAsync('COMMIT');
    return {
      status: 'applied',
      database_changes: decisions.length,
      decision_ids: decisions.map(item => item.decision_id)
    };
  } catch (error) {
    await database.runAsync('ROLLBACK');
    throw error;
  }
}

function writePlan(plan, outputPath = DEFAULT_PLAN_PATH) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
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
  const reportPath = path.resolve(argument('--report') || DEFAULT_REPORT_PATH);
  if (!fs.existsSync(reportPath)) throw new Error('Relatorio nao encontrado. Rode report_inconsistencies.js primeiro.');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (process.argv.includes('--apply')) {
    const approvalsPath = argument('--approvals');
    if (!approvalsPath) throw new Error('--apply exige --approvals com as decisoes de conciliacao aprovadas pelo operador.');
    const approvals = JSON.parse(fs.readFileSync(path.resolve(approvalsPath), 'utf8'));
    const result = await applyApprovedBackfill(database, report, approvals);
    console.log(JSON.stringify(result));
    return;
  }
  const plan = await planBackfill(database, report);
  const output = writePlan(plan, argument('--output') || DEFAULT_PLAN_PATH);
  console.log(JSON.stringify({ status: plan.status, database_changes: 0, output }));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  applyApprovedBackfill,
  assertValidReport,
  decisionIdentity,
  planBackfill,
  validateApprovals,
  writePlan
};
