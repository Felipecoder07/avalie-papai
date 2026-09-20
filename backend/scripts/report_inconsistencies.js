const db = require('../src/config/database');
const fs = require('fs');
const path = require('path');

async function runReport() {
  const report = {
    duplicidades_usuarios: [],
    pagamentos_sem_reserva: [],
    grupos_com_saldo_inconsistente: [],
    contas_superadmin: [],
    segredos_padrao: []
  };

  try {
    // 1. Duplicidades de e-mails em diferentes tenants ou no mesmo tenant
    report.duplicidades_usuarios = await db.allAsync(`
      SELECT email, COUNT(*) as qtd, GROUP_CONCAT(tenant_id) as tenants
      FROM Usuarios
      GROUP BY email
      HAVING COUNT(*) > 1
    `);

    // 2. Pagamentos Órfãos (sem referência válida)
    report.pagamentos_sem_reserva = await db.allAsync(`
      SELECT p.id, p.valor, p.reserva_id
      FROM Pagamentos p
      LEFT JOIN Reservas r ON p.reserva_id = r.id
      WHERE r.id IS NULL
    `);

    // 3. Contas SuperAdmin
    report.contas_superadmin = await db.allAsync(`
      SELECT id, nome, email, criado_em
      FROM Usuarios
      WHERE perfil = 'SuperAdmin'
    `);

    // 4. Grupos com saldo inconsistente (Reservas do mesmo grupo_id vs Pagamentos)
    // Para simplificar, vamos listar reservas agrupadas cujo valor total difere dos pagamentos (ignorando grupos não fechados, mas reportando)
    report.grupos_com_saldo_inconsistente = await db.allAsync(`
      SELECT r.grupo_id, SUM(r.valor_total) as valor_reservas, SUM(COALESCE(p.valor_pago, 0)) as valor_pago
      FROM Reservas r
      LEFT JOIN (
        SELECT reserva_id, SUM(valor) as valor_pago
        FROM Pagamentos
        GROUP BY reserva_id
      ) p ON p.reserva_id = r.id
      WHERE r.grupo_id IS NOT NULL AND r.grupo_id != ''
      GROUP BY r.grupo_id
      HAVING SUM(r.valor_total) < SUM(COALESCE(p.valor_pago, 0))
    `);

    // 5. Segredos Padrão
    // Inspeciona contas que possuam um segredo 2FA padrão ou nulo
    report.segredos_padrao = await db.allAsync(`
      SELECT id, email, perfil
      FROM Usuarios
      WHERE two_factor_secret = '123456' OR two_factor_secret = 'padrao'
    `);

    const reportPath = path.join(__dirname, '../../data/inconsistencies_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`Relatório gerado com sucesso em: ${reportPath}`);
    console.log(`- Duplicidades de e-mail: ${report.duplicidades_usuarios.length}`);
    console.log(`- Pagamentos órfãos: ${report.pagamentos_sem_reserva.length}`);
    console.log(`- SuperAdmins: ${report.contas_superadmin.length}`);
    console.log(`- Grupos inconsistentes: ${report.grupos_com_saldo_inconsistente.length}`);
    console.log(`- Contas com segredo padrão: ${report.segredos_padrao.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    process.exit(1);
  }
}

runReport();
