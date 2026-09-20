const logger = require('../utils/safeLogger').forModule('arenasController');
const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');

// ─── BUSCAR ARENA ───────────────────────────────────────────────────────────
const getMinhaArena = async (req, res) => {
  const tenant_id = req.user.tenant_id;
  
  try {
    const arena = await db.getAsync(`SELECT id, nome, endereco, telefone, email, slug, status,
      notif_reserva_email, notif_reserva_whatsapp, notif_cancelamento_email, notif_pagamento_email,
      alerta_pagamento_minutos, horario_abertura, horario_fechamento, chave_pix, titular_pix, cidade_pix,
      foto_capa, fuso_horario, plano_id, dia_vencimento, trial_expira_em, ciclo_cobranca,
      gateway_device_id, gateway_public_key, criado_em,
      CASE WHEN gateway_access_token IS NOT NULL AND TRIM(gateway_access_token) != '' THEN 1 ELSE 0 END AS gateway_connected
      FROM Arenas WHERE id = ?`, [tenant_id]);
    
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }
    
    // A chave privada é usada somente no servidor, inclusive na tela de configurações.
    const publicArena = { ...arena, gateway_connected: Boolean(arena.gateway_connected) };
    res.json(publicArena);
  } catch (error) {
    logger.error('Erro ao buscar arena:', error);
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
    logger.error('Erro ao atualizar arena:', error);
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
    const matches = typeof image === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!matches) return res.status(400).json({error:'Formato permitido: PNG, JPEG ou WebP.'});
    const source = Buffer.from(matches[2], 'base64');
    if (source.length > 5*1024*1024) return res.status(413).json({error:'Imagem excede 5 MB.'});
    const sharp=require('sharp');
    const decoder=sharp(source,{limitInputPixels:16000000,animated:false});
    const metadata=await decoder.metadata();
    if(metadata.format!==matches[1] || !metadata.width || !metadata.height) return res.status(400).json({error:'Conteudo de imagem invalido.'});
    const buffer=await decoder.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
    const ext='webp';

    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `arena_capa_${tenant_id}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    await fs.promises.writeFile(filePath, buffer, {flag:'wx'});

    const relativeUrl = `/uploads/${fileName}`;
    res.json({
      message: 'Upload realizado com sucesso!',
      foto_capa: relativeUrl
    });
  } catch (error) {
    logger.error('Erro no upload da foto de capa:', error);
    res.status(400).json({ error: 'Imagem invalida ou impossivel de processar.' });
  }
};

module.exports = {
  getMinhaArena,
  atualizarMinhaArena,
  uploadFotoCapa
};
