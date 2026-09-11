const bcrypt = require('bcrypt');
const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');

// ─── LISTAR USUÁRIOS ─────────────────────────────────────────────────────────
const listarUsuarios = async (req, res) => {
  try {
    const usuarios = await db.allAsync(
      `SELECT id, nome, email, perfil, criado_em, cliente_id 
       FROM Usuarios 
       WHERE tenant_id = ? AND (perfil IS NULL OR (perfil != 'Cliente' AND perfil != 'cliente')) 
       ORDER BY nome ASC`,
      [req.user.tenant_id]
    );
    res.json(usuarios);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar usuários.' });
  }
};

// ─── CRIAR USUÁRIO ───────────────────────────────────────────────────────────
const criarUsuario = async (req, res) => {
  const { nome, email, senha, perfil } = req.body;
  const admin_id = req.user.id;
  const ip = req.headers['x-forwarded-for'] || req.ip;

  if (!nome || !email || !senha || !perfil) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios para criação.' });
  }

  try {
    const tenant_id = req.user.tenant_id;

    // Validar limite de usuários do plano SaaS da arena
    const arenaPlano = await db.getAsync(`
      SELECT p.nome, p.max_usuarios 
      FROM Arenas a
      LEFT JOIN PlanosSaaS p ON a.plano_id = p.id
      WHERE a.id = ?
    `, [tenant_id]);

    if (arenaPlano && arenaPlano.max_usuarios) {
      const usersCount = await db.getAsync(
        "SELECT COUNT(*) as total FROM Usuarios WHERE tenant_id = ? AND (perfil IS NULL OR (perfil != 'Cliente' AND perfil != 'cliente'))",
        [tenant_id]
      );
      if (usersCount && usersCount.total >= arenaPlano.max_usuarios) {
        return res.status(403).json({
          error: `Limite de usuários atingido para o plano ${arenaPlano.nome} (máximo ${arenaPlano.max_usuarios} funcionários). Faça upgrade do seu plano para adicionar novos usuários.`,
          code: 'PLAN_LIMIT_REACHED',
          limite: arenaPlano.max_usuarios,
          atual: usersCount.total
        });
      }
    }

    const crypto = require("node:crypto");
    // Gerar token de ativação (válido por 7 dias)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 3600000).toISOString();

    // Senha aleatória temporária (conta travada até o primeiro reset)
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const senha_hash = await bcrypt.hash(tempPassword, 12);

    const result = await db.runAsync(
      `INSERT INTO Usuarios (tenant_id, nome, email, senha_hash, perfil, reset_password_token, reset_password_expires) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.tenant_id, nome, email, senha_hash, perfil, token, expires]
    );

    logAuditEvent(admin_id, 'Criação de Usuário', `Criou o usuário ${email} (${perfil})`, ip);

    // Identificar origem dinâmica
    const referer = req.headers['referer'] || req.headers['origin'] || 'http://localhost:5173';
    const baseUri = referer.includes('5174') ? 'http://localhost:5174' : 'http://localhost:5173';
    const activationLink = `${baseUri}/redefinir-senha?token=${token}`;

    // Dispara o e-mail de boas-vindas do funcionário em background
    (async () => {
      try {
        const arenaObj = await db.getAsync('SELECT nome FROM Arenas WHERE id = ?', [req.user.tenant_id]);
        const arenaName = arenaObj ? arenaObj.nome : 'Sua Arena';

        const { sendEmail } = require('../services/emailService');
        const subject = `Sua conta foi criada no Arenix - Ative seu Acesso 🎾`;
        const html = `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
            <h2 style="color: #2F855A; border-bottom: 2px solid #E2E8F0; padding-bottom: 10px;">Boas-vindas à Equipe! 🎉</h2>
            <p>Olá, <strong>${nome}</strong>!</p>
            <p>Sua conta de colaborador na arena <strong>${arenaName}</strong> foi criada com sucesso no sistema <strong>Arenix CourtManager</strong>.</p>
            <p>Seu perfil de acesso configurado é: <strong>${perfil}</strong>.</p>
            <p>Para ativar sua conta e cadastrar a sua senha de acesso, clique no botão abaixo:</p>
            <div style="margin: 30px 0;">
              <a href="${activationLink}" style="background-color: #2F855A; color: #FFF; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Ativar Minha Conta</a>
            </div>
            <p style="font-size: 0.9em; color: #718096;">Ou copie o link a seguir no seu navegador:</p>
            <p style="font-size: 0.85em; color: #2F855A; word-break: break-all;"><a href="${activationLink}">${activationLink}</a></p>
            <p style="font-size: 0.9em; color: #E53E3E; font-weight: bold;">Este link de ativação é válido por 7 dias.</p>
            <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 20px 0;" />
            <p style="font-size: 0.8em; color: #A0AEC0;">Esta é uma mensagem automática enviada por Arenix CourtManager.</p>
          </div>
        `;
        await sendEmail(email, subject, html);
      } catch (e) {
        console.error('[SMTP] Erro ao disparar e-mail de boas-vindas do funcionário:', e.message);
      }
    })();

    res.status(201).json({ message: 'Usuário criado com sucesso e e-mail de ativação enviado.', id: result.lastID });
  } catch (error) {
    console.error(error);
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
    }
    res.status(500).json({ error: 'Erro ao criar usuário.' });
  }
};

// ─── EDITAR USUÁRIO ──────────────────────────────────────────────────────────
const editarUsuario = async (req, res) => {
  const { id } = req.params;
  const { nome, email, perfil, senha } = req.body;
  const admin_id = req.user.id;
  const ip = req.headers['x-forwarded-for'] || req.ip;

  if (!nome || !email || !perfil) {
    return res.status(400).json({ error: 'Nome, e-mail e perfil são obrigatórios.' });
  }

  try {
    let sql = `UPDATE Usuarios SET nome = ?, email = ?, perfil = ? WHERE id = ? AND tenant_id = ?`;
    let params = [nome, email, perfil, id, req.user.tenant_id];

    if (senha) {
      const senha_hash = await bcrypt.hash(senha, 12);
      sql = `UPDATE Usuarios SET nome = ?, email = ?, perfil = ?, senha_hash = ? WHERE id = ? AND tenant_id = ?`;
      params = [nome, email, perfil, senha_hash, id, req.user.tenant_id];
    }

    const result = await db.runAsync(sql, params);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    logAuditEvent(admin_id, 'Edição de Usuário', `Editou os dados do usuário ID ${id} (${email})`, ip);
    res.json({ message: 'Usuário atualizado com sucesso.' });
  } catch (error) {
    console.error(error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'O e-mail informado já está em uso por outro usuário.' });
    }
    res.status(500).json({ error: 'Erro ao editar usuário.' });
  }
};

// ─── EXCLUIR USUÁRIO ─────────────────────────────────────────────────────────
const excluirUsuario = async (req, res) => {
  const { id } = req.params;
  const admin_id = req.user.id;
  const ip = req.headers['x-forwarded-for'] || req.ip;

  // Evita que o admin exclua a si mesmo
  if (Number(id) === Number(admin_id)) {
    return res.status(400).json({ error: 'Você não pode excluir a sua própria conta.' });
  }

  try {
    const usuario = await db.getAsync(`SELECT perfil FROM Usuarios WHERE id = ? AND tenant_id = ?`, [id, req.user.tenant_id]);
    if (usuario && usuario.perfil === 'Administrador') {
      return res.status(403).json({ error: 'Não é possível excluir um Administrador.' });
    }

    const result = await db.runAsync(`DELETE FROM Usuarios WHERE id = ? AND tenant_id = ?`, [id, req.user.tenant_id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    logAuditEvent(admin_id, 'Exclusão de Usuário', `Excluiu o usuário ID ${id}`, ip);
    res.json({ message: 'Usuário excluído com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
};

module.exports = {
  listarUsuarios,
  criarUsuario,
  editarUsuario,
  excluirUsuario
};
