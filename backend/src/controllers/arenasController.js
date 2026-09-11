const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');

// ─── BUSCAR ARENA ───────────────────────────────────────────────────────────
const getMinhaArena = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  
  try {
    const arena = await db.getAsync(`SELECT * FROM Arenas WHERE id = ?`, [tenant_id]);
    
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }
    
    // A chave privada é usada somente no servidor, inclusive na tela de configurações.
    const publicArena = { ...arena, gateway_connected: Boolean(arena.gateway_access_token?.trim()) };
    delete publicArena.gateway_access_token;
    res.json(publicArena);
  } catch (error) {
    console.error('Erro ao buscar arena:', error);
    res.status(500).json({ error: 'Erro ao buscar dados da arena.' });
  }
};

const path = require("node:path");
const fs = require("node:fs");

// ─── ATUALIZAR ARENA ────────────────────────────────────────────────────────
const atualizarMinhaArena = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const admin_id = req.user.id;
  const ip = req.headers['x-forwarded-for'] || req.ip;
  const { 
    nome, endereco, telefone, email, fuso_horario,
    notif_reserva_email, notif_reserva_whatsapp,
    notif_cancelamento_email, notif_pagamento_email,
    alerta_pagamento_minutos,
    chave_pix, titular_pix, cidade_pix,
    foto_capa
  } = req.body;

  if (!nome) {
    return res.status(400).json({ error: 'O nome da arena é obrigatório.' });
  }

  try {
    await db.runAsync(
      `UPDATE Arenas 
       SET nome = ?, endereco = ?, telefone = ?, email = ?, fuso_horario = ?,
           notif_reserva_email = ?, notif_reserva_whatsapp = ?,
           notif_cancelamento_email = ?, notif_pagamento_email = ?,
           alerta_pagamento_minutos = ?,
           chave_pix = ?, titular_pix = ?, cidade_pix = ?,
           foto_capa = ?
       WHERE id = ?`,
      [
        nome, endereco, telefone, email, fuso_horario || 'America/Sao_Paulo',
        notif_reserva_email !== undefined ? (notif_reserva_email ? 1 : 0) : 1,
        notif_reserva_whatsapp !== undefined ? (notif_reserva_whatsapp ? 1 : 0) : 0,
        notif_cancelamento_email !== undefined ? (notif_cancelamento_email ? 1 : 0) : 1,
        notif_pagamento_email !== undefined ? (notif_pagamento_email ? 1 : 0) : 1,
        alerta_pagamento_minutos || 30,
        chave_pix || null,
        titular_pix || null,
        cidade_pix || null,
        foto_capa !== undefined ? foto_capa : null,
        tenant_id
      ]
    );

    logAuditEvent(admin_id, 'Atualização de Arena', `Editou os dados e configurações da arena ID ${tenant_id}`, ip);
    res.json({ message: 'Dados da arena atualizados com sucesso.' });
  } catch (error) {
    console.error('Erro ao atualizar arena:', error);
    res.status(500).json({ error: 'Erro ao salvar os dados da arena.' });
  }
};

// ─── UPLOAD DA FOTO DE CAPA DA ARENA ─────────────────────────────────────────
const uploadFotoCapa = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { image } = req.body; // base64

  if (!image) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
  }

  try {
    const matches = image.match(/^data:image\/([a-zA-Z0-9-+]+);base64,(.+)$/);
    let ext = 'jpg';
    let buffer;

    if (matches && matches.length === 3) {
      ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(image, 'base64');
    }

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'A imagem deve ter no máximo 5MB.' });
    }

    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `arena_capa_${tenant_id}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/uploads/${fileName}`;
    res.json({
      message: 'Upload realizado com sucesso!',
      foto_capa: relativeUrl
    });
  } catch (error) {
    console.error('Erro no upload da foto de capa:', error);
    res.status(500).json({ error: 'Erro ao processar o upload da imagem.' });
  }
};

module.exports = {
  getMinhaArena,
  atualizarMinhaArena,
  uploadFotoCapa
};
