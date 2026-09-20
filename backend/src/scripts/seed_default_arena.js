if (process.env.NODE_ENV !== 'test') throw new Error('Fixture restrita aos testes. Use convite ou recuperação verificada.');
const logger = require('../utils/safeLogger').forModule('seed_default_arena');
const db = require('../config/database');
const bcrypt = require('bcrypt');

async function seedDefaultArena() {
  try {
    await db.runAsync(`
      INSERT OR REPLACE INTO Arenas (id, nome, slug, endereco, telefone, email, chave_pix, titular_pix, cidade_pix, horario_abertura, horario_fechamento, status)
      VALUES (1, 'Felp Arena Beach Club', 'felp-arena', 'Av. Beira Mar, 1000 - Praia', '(11) 99999-9999', 'contato@felparena.com', 'arena@beachclub.com.br', 'Felp Arena Beach Club', 'SAO PAULO', '06:00', '23:00', 1)
    `);

    await db.runAsync(`
      INSERT OR REPLACE INTO Quadras (id, tenant_id, nome, tipo, preco_base, hora_abertura, hora_fechamento, status)
      VALUES (1, 1, 'Quadra 1 - Beach Tennis', 'Areia', 80.00, '06:00', '23:00', 'Ativa')
    `);

    await db.runAsync(`
      INSERT OR REPLACE INTO Quadras (id, tenant_id, nome, tipo, preco_base, hora_abertura, hora_fechamento, status)
      VALUES (2, 1, 'Quadra 2 - Futevôlei', 'Areia', 70.00, '06:00', '23:00', 'Ativa')
    `);

    await db.runAsync(`
      INSERT OR REPLACE INTO Quadras (id, tenant_id, nome, tipo, preco_base, hora_abertura, hora_fechamento, status)
      VALUES (3, 1, 'Quadra 3 - Vôlei de Praia', 'Areia', 60.00, '06:00', '23:00', 'Ativa')
    `);

    const hash = await bcrypt.hash('admin123', 12);
    await db.runAsync(`
      INSERT OR REPLACE INTO Usuarios (id, tenant_id, nome, email, senha_hash, perfil, ativo)
      VALUES (1, 1, 'Administrador Teste', 'admin@courtmanager.com', ?, 'Administrador', 1)
    `, [hash]);

    logger.log('✅ Arena Padrão, Quadras e Administrador criados com sucesso!');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Erro ao criar dados padrão:', err);
    process.exit(1);
  }
}

seedDefaultArena();
