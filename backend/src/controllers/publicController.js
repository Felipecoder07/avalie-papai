const db = require('../config/database');
const logAuditEvent = require('../utils/auditLogger');
const { criarCobrancaPix } = require('../services/gatewayService');
const { getTodayString, getLocalTimeString } = require('../utils/dateUtils');

/**
 * Controller Público — Vitrine do Tenant (Sem Necessidade de Autenticação JWT)
 */

// Helper para normalizar slug
function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Helper para cancelar automaticamente reservas pendentes vencidas (mais de 15 min ou data no passado)
async function expirarReservasAntigas() {
  try {
    await db.runAsync(
      `UPDATE Reservas 
       SET status = 'Cancelada', status_pagamento = 'Expirado' 
       WHERE (status = 'Pendente' OR status_pagamento = 'Pendente') 
         AND status_pagamento NOT IN ('Pago', 'Estornado') 
         AND (
           datetime(criado_em, '+15 minutes') < datetime('now', 'localtime') 
           OR data_reserva < date('now', 'localtime')
         )`
    );
  } catch (e) {
    console.warn('[Public Controller Warning] Erro ao expirar reservas antigas:', e.message);
  }
}

// 1. Resolver Dados da Arena pelo Slug
const getTenantBySlug = async (req, res) => {
  const { slug } = req.params;

  try {
    const arena = await db.getAsync(
      `SELECT id, nome, endereco, telefone, email, fuso_horario, horario_abertura, horario_fechamento, status, slug, foto_capa, criado_em
       FROM Arenas 
       WHERE slug = ? AND status != -1`,
      [slug]
    );

    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada. Verifique o link e tente novamente.' });
    }

    if (arena.status === 0) {
      return res.status(403).json({
        blocked: true,
        error: 'Esta arena está com os agendamentos temporariamente suspensos. Entre em contato com o local.'
      });
    }

    // Calcula o horário consolidado de funcionamento da arena com base no menor horário de abertura e maior de fechamento das quadras ativas
    const quadrasHours = await db.getAsync(
      `SELECT MIN(hora_abertura) as min_abertura, MAX(hora_fechamento) as max_fechamento 
       FROM Quadras 
       WHERE tenant_id = ? AND status = 'Ativa'`,
      [arena.id]
    );

    const horaAberturaFinal = (quadrasHours && quadrasHours.min_abertura)
      ? quadrasHours.min_abertura
      : (arena.horario_abertura || '06:00');

    const horaFechamentoFinal = (quadrasHours && quadrasHours.max_fechamento)
      ? quadrasHours.max_fechamento
      : (arena.horario_fechamento || '23:00');

    res.json({
      arena: {
        ...arena,
        horario_abertura: horaAberturaFinal,
        horario_fechamento: horaFechamentoFinal
      }
    });
  } catch (err) {
    console.error('[Public Controller Error] getTenantBySlug:', err);
    res.status(500).json({ error: 'Erro ao carregar dados da arena.' });
  }
};

// 2. Buscar Quadras Ativas pelo Slug da Arena
const getQuadrasBySlug = async (req, res) => {
  const { slug } = req.params;

  try {
    const arena = await db.getAsync('SELECT id FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    const quadras = await db.allAsync(
      `SELECT id, nome, tipo, modalidades, preco_base, hora_abertura, hora_fechamento, status
       FROM Quadras 
       WHERE tenant_id = ? AND status = 'Ativa'`,
      [arena.id]
    );

    const formatted = quadras.map(q => {
      let modalidades = [];
      if (q.modalidades) {
        try {
          modalidades = typeof q.modalidades === 'string' ? JSON.parse(q.modalidades) : q.modalidades;
        } catch {
          modalidades = [{ nome: q.tipo || 'Beach Tennis', preco: q.preco_base || 80 }];
        }
      } else if (q.tipo) {
        modalidades = q.tipo === 'Areia' 
          ? [
              { nome: 'Beach Tennis', preco: q.preco_base || 80 },
              { nome: 'Vôlei de Praia', preco: q.preco_base || 80 },
              { nome: 'Futevôlei', preco: q.preco_base || 80 }
            ]
          : [{ nome: q.tipo, preco: q.preco_base || 80 }];
      }

      const normalized = (Array.isArray(modalidades) ? modalidades : []).map(m => {
        if (typeof m === 'string') return { nome: m, preco: q.preco_base || 80 };
        return { nome: m.nome, preco: Number(m.preco != null ? m.preco : q.preco_base || 80) };
      });

      return { ...q, modalidades: normalized };
    });

    res.json({ quadras: formatted });
  } catch (err) {
    console.error('[Public Controller Error] getQuadrasBySlug:', err);
    res.status(500).json({ error: 'Erro ao buscar quadras.' });
  }
};

// 3. Matriz de Disponibilidade de Horários (100% Privado sem expor nomes de terceiros - RN-02)
const getDisponibilidadeBySlug = async (req, res) => {
  const { slug } = req.params;
  const dataFiltro = req.query.data || new Date().toISOString().split('T')[0];
  const quadraIdFiltro = req.query.quadra_id ? parseInt(req.query.quadra_id, 10) : null;
  const esporteFiltro = req.query.esporte || null;

  try {
    const arena = await db.getAsync('SELECT id, horario_abertura, horario_fechamento FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    // Busca quadras ativas da arena
    let queryQuadras = 'SELECT id, nome, tipo, modalidades, preco_base, hora_abertura, hora_fechamento FROM Quadras WHERE tenant_id = ? AND status = \'Ativa\'';
    const paramsQuadras = [arena.id];
    if (quadraIdFiltro) {
      queryQuadras += ' AND id = ?';
      paramsQuadras.push(quadraIdFiltro);
    }
    const quadras = await db.allAsync(queryQuadras, paramsQuadras);

    // 1. Cancela automaticamente reservas pendentes com mais de 15 minutos sem pagamento ou no passado
    await expirarReservasAntigas();

    // Busca reservas ocupadas no dia (NUNCA expõe cliente_id ou nome do atleta - RN-02)
    // Apenas reservas efetivamente CONFIRMADAS/PAGAS ocupam a grade pública
    const reservasOcupadas = await db.allAsync(
      `SELECT quadra_id, hora_inicio, hora_fim
       FROM Reservas
       WHERE tenant_id = ? AND data_reserva = ? AND status IN ('Confirmada', 'Pago') AND status_pagamento != 'Desistência'`,
      [arena.id, dataFiltro]
    );

    // Busca bloqueios de quadra no dia
    const bloqueios = await db.allAsync(
      `SELECT quadra_id, hora_inicio, hora_fim, motivo
       FROM Bloqueios
       WHERE quadra_id IN (SELECT id FROM Quadras WHERE tenant_id = ?) AND data_bloqueio = ?`,
      [arena.id, dataFiltro]
    );

    const todayStr = getTodayString();
    const currentTimeStr = getLocalTimeString();
    const isHoje = dataFiltro === todayStr;

    const resultadoPorQuadra = quadras.map(q => {
      // Normaliza modalidades com seus preços
      let modalidades = [];
      if (q.modalidades) {
        try {
          modalidades = typeof q.modalidades === 'string' ? JSON.parse(q.modalidades) : q.modalidades;
        } catch {
          modalidades = [{ nome: q.tipo || 'Beach Tennis', preco: q.preco_base || 80 }];
        }
      } else if (q.tipo) {
        modalidades = q.tipo === 'Areia'
          ? [
              { nome: 'Beach Tennis', preco: q.preco_base || 80 },
              { nome: 'Vôlei de Praia', preco: q.preco_base || 80 },
              { nome: 'Futevôlei', preco: q.preco_base || 80 }
            ]
          : [{ nome: q.tipo, preco: q.preco_base || 80 }];
      }

      const normalizedModalidades = (Array.isArray(modalidades) ? modalidades : []).map(m => {
        if (typeof m === 'string') return { nome: m, preco: q.preco_base || 80 };
        return { nome: m.nome, preco: Number(m.preco != null ? m.preco : q.preco_base || 80) };
      });

      // Se o atleta filtrou por esporte, busca o preço específico daquele esporte nesta quadra
      let precoSlot = q.preco_base || 80;
      if (esporteFiltro && esporteFiltro !== 'Todos') {
        const modalidadeEncontrada = normalizedModalidades.find(m => m.nome === esporteFiltro);
        if (modalidadeEncontrada && modalidadeEncontrada.preco > 0) {
          precoSlot = modalidadeEncontrada.preco;
        }
      }

      // Define os horários reais da quadra/arena (Ex: das 06:00 às 23:00)
      const hAbertura = q.hora_abertura || arena.horario_abertura || '06:00';
      const hFechamento = q.hora_fechamento || arena.horario_fechamento || '23:00';

      const startHour = parseInt(hAbertura.split(':')[0], 10);
      const endHour = parseInt(hFechamento.split(':')[0], 10);

      const slotsHorarios = [];
      for (let h = startHour; h < endHour; h++) {
        slotsHorarios.push(`${String(h).padStart(2, '0')}:00`);
      }

      const slots = slotsHorarios.map(hInicio => {
        const [h, m] = hInicio.split(':').map(Number);
        const hFim = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

        // Checa se o horário no dia de hoje já passou
        const jaPassou = isHoje && hInicio <= currentTimeStr;

        // Checa se coincide com reserva existente
        const temReserva = reservasOcupadas.some(r => String(r.quadra_id) === String(q.id) && (
          (r.hora_inicio <= hInicio && r.hora_fim > hInicio) ||
          (r.hora_inicio < hFim && r.hora_fim >= hFim)
        ));

        // Checa se coincide com bloqueio
        const temBloqueio = bloqueios.some(b => String(b.quadra_id) === String(q.id) && (
          (b.hora_inicio <= hInicio && b.hora_fim > hInicio) ||
          (b.hora_inicio < hFim && b.hora_fim >= hFim)
        ));

        let statusSlot = 'disponivel';
        if (jaPassou) {
          statusSlot = 'passado';
        } else if (temReserva || temBloqueio) {
          statusSlot = 'ocupado';
        }

        return {
          hora_inicio: hInicio,
          hora_fim: hFim,
          status: statusSlot,
          preco: precoSlot
        };
      });

      return {
        quadra_id: q.id,
        quadra_nome: q.nome,
        tipo: q.tipo || 'Areia',
        modalidades: normalizedModalidades,
        preco_base: precoSlot,
        hora_abertura: hAbertura,
        hora_fechamento: hFechamento,
        slots
      };
    });

    res.json({
      arena_id: arena.id,
      data: dataFiltro,
      quadras: resultadoPorQuadra
    });
  } catch (err) {
    console.error('[Public Controller Error] getDisponibilidadeBySlug:', err);
    res.status(500).json({ error: 'Erro ao verificar disponibilidade.' });
  }
};

/**
 * Gerador de Payload Pix EMV QRCPS (Padrão Oficial Banco Central do Brasil)
 * Permite que o pagamento vá DIRETO para a conta bancária do Dono da Arena
 */
function gerarPixEMV({ chave, nome, cidade = 'SAO PAULO', valor, txid = '***' }) {
  const cleanChave = (chave || '').trim();
  if (!cleanChave) return '';

  const cleanNome = (nome || 'ARENA')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .substring(0, 25)
    .toUpperCase();

  const cleanCidade = (cidade || 'SAO PAULO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .substring(0, 15)
    .toUpperCase();

  const valStr = parseFloat(valor).toFixed(2);
  const cleanTxid = (txid || '***').replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) || '***';

  const formatField = (id, value) => {
    const len = String(value.length).padStart(2, '0');
    return `${id}${len}${value}`;
  };

  const gui = formatField('00', 'BR.GOV.BCB.PIX');
  const key = formatField('01', cleanChave);
  const merchantAccount = formatField('26', `${gui}${key}`);

  const payloadParts = [
    formatField('00', '01'),
    merchantAccount,
    formatField('52', '0000'),
    formatField('53', '986'),
    formatField('54', valStr),
    formatField('58', 'BR'),
    formatField('59', cleanNome),
    formatField('60', cleanCidade),
    formatField('62', formatField('05', cleanTxid)),
  ];

  const payloadString = payloadParts.join('') + '6304';

  let crc = 0xFFFF;
  for (let i = 0; i < payloadString.length; i++) {
    crc ^= (payloadString.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xFFFF;
    }
  }

  const crcHex = (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  return `${payloadString}${crcHex}`;
}

async function validateBookingItems(listaItens) {
  const todayStr = getTodayString();
  const currentTimeStr = getLocalTimeString();

  for (const item of listaItens) {
    if (item.data_reserva < todayStr) {
      return 'Não é permitido criar agendamentos em datas passadas.';
    }
    if (item.data_reserva === todayStr && item.hora_inicio <= currentTimeStr) {
      return `Ops! O horário das ${item.hora_inicio} do dia de hoje já encerrou. Escolha um horário futuro.`;
    }
  }
  return null;
}

async function checkBookingConflicts(listaItens) {
  await db.runAsync(
    `UPDATE Reservas 
     SET status = 'Cancelada', status_pagamento = 'Expirado' 
     WHERE status = 'Pendente' AND status_pagamento = 'Pendente' 
       AND datetime(criado_em, '+15 minutes') < datetime('now')`
  );

  for (const item of listaItens) {
    const conflito = await db.getAsync(
      `SELECT id FROM Reservas 
       WHERE quadra_id = ? AND data_reserva = ? AND status != 'Cancelada'
         AND (hora_inicio < ? AND hora_fim > ?)`,
      [item.quadra_id, item.data_reserva, item.hora_fim, item.hora_inicio]
    );
    if (conflito) {
      return `Ops! O horário das ${item.hora_inicio} do dia ${item.data_reserva} já foi reservado por outro atleta.`;
    }
  }
  return null;
}

async function findOrCreateTenantClient(tenantId, { nome, email, telefone, cpf }) {
  const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : null;
  const cleanPhone = telefone && telefone.trim() ? telefone.trim() : null;
  const cleanCpf = cpf && cpf.trim() ? cpf.trim() : null;

  let cliente = null;
  if (cleanEmail) {
    cliente = await db.getAsync('SELECT id FROM Clientes WHERE LOWER(email) = ?', [cleanEmail]);
  }
  if (!cliente && cleanPhone && cleanPhone !== '(00) 00000-0000') {
    cliente = await db.getAsync('SELECT id FROM Clientes WHERE tenant_id = ? AND telefone = ?', [tenantId, cleanPhone]);
  }
  if (!cliente && cleanCpf) {
    cliente = await db.getAsync('SELECT id FROM Clientes WHERE cpf = ?', [cleanCpf]);
  }

  if (cliente) {
    await db.runAsync(
      `UPDATE Clientes 
       SET nome = ?, telefone = COALESCE(?, telefone), email = COALESCE(?, email), cpf = COALESCE(?, cpf) 
       WHERE id = ?`,
      [nome.trim(), cleanPhone, cleanEmail, cleanCpf, cliente.id]
    );
    return cliente;
  }

  try {
    const rCliente = await db.runAsync(
      'INSERT INTO Clientes (tenant_id, nome, email, telefone, cpf) VALUES (?, ?, ?, ?, ?)',
      [tenantId, nome.trim(), cleanEmail, cleanPhone, cleanCpf]
    );
    return { id: rCliente.lastID };
  } catch (insertErr) {
    if (cleanEmail) {
      cliente = await db.getAsync('SELECT id FROM Clientes WHERE LOWER(email) = ?', [cleanEmail]);
    }
    if (!cliente && cleanCpf) {
      cliente = await db.getAsync('SELECT id FROM Clientes WHERE cpf = ?', [cleanCpf]);
    }
    if (cliente) {
      await db.runAsync(
        `UPDATE Clientes SET nome = ?, telefone = COALESCE(?, telefone) WHERE id = ?`,
        [nome.trim(), cleanPhone, cliente.id]
      );
      return cliente;
    }
    throw insertErr;
  }
}

async function insertMultiSlotReservations(tenantId, clienteId, listaItens) {
  let valorTotalGeral = 0;
  const reservasCriadasIds = [];
  const grupoId = `GRUPO_${clienteId}_${Date.now()}`;

  for (const item of listaItens) {
    const quadra = await db.getAsync('SELECT preco_base, modalidades, tipo FROM Quadras WHERE id = ? AND tenant_id = ?', [item.quadra_id, tenantId]);
    let precoItem = (quadra && typeof quadra.preco_base === 'number' && quadra.preco_base > 0) ? quadra.preco_base : 80.0;
    
    const esporteItem = item.esporte || 'Geral';
    if (quadra && quadra.modalidades) {
      try {
        const parsed = typeof quadra.modalidades === 'string' ? JSON.parse(quadra.modalidades) : quadra.modalidades;
        if (Array.isArray(parsed)) {
          const match = parsed.find(m => (typeof m === 'object' ? m.nome : m) === esporteItem);
          if (match && typeof match === 'object' && match.preco != null && Number(match.preco) > 0) {
            precoItem = Number(match.preco);
          }
        }
      } catch {
        // Ignorar parsing
      }
    }

    valorTotalGeral += precoItem;

    const rReserva = await db.runAsync(
      `INSERT INTO Reservas (tenant_id, cliente_id, quadra_id, data_reserva, hora_inicio, hora_fim, valor_total, status, status_pagamento, grupo_id, esporte)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendente', 'Pendente', ?, ?)`,
      [tenantId, clienteId, item.quadra_id, item.data_reserva, item.hora_inicio, item.hora_fim, precoItem, grupoId, esporteItem]
    );
    reservasCriadasIds.push(rReserva.lastID);
  }

  return { valorTotalGeral, reservasCriadasIds };
}

// 4. Checkout Rápido sem Senha — Agendamento (Único ou Múltiplos Horários) + Gerar Pix
const agendarReservaPublica = async (req, res) => {
  const { slug } = req.params;
  const { nome, telefone, cpf, email, quadra_id, data_reserva, hora_inicio, hora_fim, itens } = req.body;

  let listaItens = [];
  if (Array.isArray(itens) && itens.length > 0) {
    listaItens = itens;
  } else if (quadra_id && data_reserva && hora_inicio && hora_fim) {
    listaItens = [{ quadra_id, data_reserva, hora_inicio, hora_fim }];
  } else {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios e selecione ao menos um horário.' });
  }

  if (!nome || !telefone) {
    return res.status(400).json({ error: 'Nome e WhatsApp são obrigatórios.' });
  }

  let reservasCriadasIds = [];
  try {
    const arena = await db.getAsync(
      'SELECT id, nome, email, telefone, chave_pix, titular_pix, cidade_pix, gateway_access_token FROM Arenas WHERE slug = ? AND status = 1',
      [slug]
    );
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada ou indisponível.' });
    }

    const hasGateway = !!(arena.gateway_access_token?.trim());
    const hasChavePix = !!(arena.chave_pix?.trim());

    if (!hasGateway && !hasChavePix) {
      return res.status(400).json({
        payment_not_configured: true,
        telefone_arena: arena.telefone || null,
        error: 'Esta arena ainda não configurou o recebimento de pagamentos online via Pix. Entre em contato direto com a recepção para agendar.'
      });
    }

    const validationError = await validateBookingItems(listaItens);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const conflictError = await checkBookingConflicts(listaItens);
    if (conflictError) {
      return res.status(400).json({ error: conflictError });
    }

    const cliente = await findOrCreateTenantClient(arena.id, { nome, email, telefone, cpf });

    // Trava idempotente para 15 segundos
    const itemPrimeiro = listaItens[0];
    const reservaRecente = await db.getAsync(
      `SELECT id, valor_total FROM Reservas
       WHERE cliente_id = ? AND quadra_id = ? AND data_reserva = ? AND hora_inicio = ? AND status != 'Cancelada'
         AND datetime(criado_em, '+15 seconds') >= datetime('now')`,
      [cliente.id, itemPrimeiro.quadra_id, itemPrimeiro.data_reserva, itemPrimeiro.hora_inicio]
    );

    if (reservaRecente) {
      const chavePixArena = arena.chave_pix?.trim() || '';
      const titularArena = arena.titular_pix || arena.nome || 'Arena';
      const cidadeArena = arena.cidade_pix || 'SAO PAULO';
      const copiaCola = gerarPixEMV({
        chave: chavePixArena,
        nome: titularArena,
        cidade: cidadeArena,
        valor: reservaRecente.valor_total,
        txid: `RESERVA${reservaRecente.id}`
      });

      return res.json({
        reserva_id: reservaRecente.id,
        reservas_ids: [reservaRecente.id],
        valor_total: reservaRecente.valor_total,
        copia_cola: copiaCola,
        qr_code: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(copiaCola)}`,
        gateway_ref: `PIX_MULTI_${reservaRecente.id}`
      });
    }

    const inserted = await insertMultiSlotReservations(arena.id, cliente.id, listaItens);
    const valorTotalGeral = inserted.valorTotalGeral;
    reservasCriadasIds = inserted.reservasCriadasIds;
    const primeiraReservaId = reservasCriadasIds[0];

    let pixData = null;
    try {
      if (arena.gateway_access_token) {
        pixData = await criarCobrancaPix(primeiraReservaId, valorTotalGeral, arena.id);
      }
    } catch (eGateway) {
      const safeMsg = String(eGateway?.message || '').replace(/[\r\n]/g, '');
      console.warn('[Public Checkout Warning] Falha ao gerar Pix no gateway:', safeMsg);
    }

    if (!pixData && !hasChavePix) {
      if (reservasCriadasIds.length > 0) {
        const placeholders = reservasCriadasIds.map(() => '?').join(',');
        await db.runAsync(`DELETE FROM Reservas WHERE id IN (${placeholders})`, reservasCriadasIds);
      }
      return res.status(400).json({
        payment_not_configured: true,
        telefone_arena: arena.telefone || null,
        error: 'Esta arena ainda não configurou o recebimento de pagamentos online via Pix.'
      });
    }

    const chavePixArena = arena.chave_pix?.trim();
    const titularArena = arena.titular_pix || arena.nome || 'Arena';
    const cidadeArena = arena.cidade_pix || 'SAO PAULO';

    const gatewayRef = pixData?.gateway_ref || `PIX_MULTI_${primeiraReservaId}_${Date.now()}`;
    const copiaCola = pixData?.copia_cola || gerarPixEMV({
      chave: chavePixArena,
      nome: titularArena,
      cidade: cidadeArena,
      valor: valorTotalGeral,
      txid: `RES${primeiraReservaId}`
    });

    logAuditEvent(
      0,
      'Reserva Publica Multi-Slot',
      `Atleta '${nome}' agendou ${reservasCriadasIds.length} reserva(s) [IDs: ${reservasCriadasIds.join(', ')}] totalizando R$ ${valorTotalGeral.toFixed(2)}.`,
      req.ip
    );

    res.status(201).json({
      message: 'Reserva(s) realizada(s) com sucesso! Realize o pagamento via Pix para garantir a vaga.',
      reserva_id: primeiraReservaId,
      reservas_ids: reservasCriadasIds,
      gateway_ref: gatewayRef,
      copia_cola: copiaCola,
      qr_code: pixData?.qr_code || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(copiaCola)}`,
      valor_total: valorTotalGeral,
      expira_em_minutos: 15
    });
  } catch (err) {
    if (reservasCriadasIds.length > 0) {
      try {
        const placeholders = reservasCriadasIds.map(() => '?').join(',');
        await db.runAsync(`DELETE FROM Reservas WHERE id IN (${placeholders})`, reservasCriadasIds);
      } catch (rollbackErr) {
        console.warn('[Public Checkout Catch Rollback Error]:', rollbackErr.message);
      }
    }
    console.error('[Public Controller Error] agendarReservaPublica:', err);
    res.status(500).json({ error: 'Erro ao concluir o agendamento.' });
  }
};

async function conectarAtletaExistente({ existente, senha, tenantId, arena, telefone, req, res, JWT_SECRET, bcrypt, jwt }) {
  if (existente.ativo === 0) {
    return res.status(403).json({ error: 'Sua conta de usuário está desativada. Entre em contato com a arena.' });
  }

  const senhaValida = await bcrypt.compare(senha, existente.senha_hash);
  if (!senhaValida) {
    return res.status(400).json({ error: 'Este e-mail já está cadastrado em nossa plataforma. Verifique a senha ou faça login.' });
  }

  let clienteExistente = await db.getAsync(
    'SELECT id, telefone FROM Clientes WHERE tenant_id = ? AND LOWER(email) = ?',
    [tenantId, existente.email.trim().toLowerCase()]
  );

  if (!clienteExistente) {
    try {
      await db.runAsync(
        'INSERT INTO Clientes (tenant_id, nome, email, telefone) VALUES (?, ?, ?, ?)',
        [tenantId, existente.nome, existente.email.trim().toLowerCase(), telefone ? telefone.trim() : null]
      );
    } catch (eCl) {
      /* ignora colisão de constraint se o cliente já existia */
    }
    clienteExistente = await db.getAsync(
      'SELECT id, telefone FROM Clientes WHERE tenant_id = ? AND LOWER(email) = ?',
      [tenantId, existente.email.trim().toLowerCase()]
    );
  }

  const token = jwt.sign(
    { id: existente.id, perfil: 'cliente', email: existente.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  logAuditEvent(
    existente.id,
    'Acesso Atleta Publico Multiarena',
    `Atleta '${existente.nome}' conectou-se à arena '${arena.nome}' usando sua conta universal.`,
    req.ip
  );

  return res.status(200).json({
    message: 'Bem-vindo de volta! Sua conta universal foi conectada a esta arena com sucesso.',
    token,
    usuario: {
      id: existente.id,
      nome: existente.nome,
      email: existente.email,
      telefone: clienteExistente ? (clienteExistente.telefone || (telefone ? telefone.trim() : '')) : ''
    }
  });
}

// 5. Cadastro Real do Atleta via Portal Público por Tenant
const cadastrarAtletaPublico = async (req, res) => {
  const { slug } = req.params;
  const { nome, email, senha, telefone } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios para realizar o cadastro.' });
  }

  if (senha.length < 6) {
    return res.status(400).json({ error: 'A senha deve possuir no mínimo 6 caracteres.' });
  }

  try {
    const arena = await db.getAsync('SELECT id, nome FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada ou indisponível.' });
    }

    const tenantId = arena.id;
    const bcrypt = require('bcrypt');
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';

    const existente = await db.getAsync(
      'SELECT id, nome, email, senha_hash, ativo FROM Usuarios WHERE LOWER(email) = ?',
      [email.trim().toLowerCase()]
    );

    if (existente) {
      return await conectarAtletaExistente({ existente, senha, tenantId, arena, telefone, req, res, JWT_SECRET, bcrypt, jwt });
    }

    if (telefone && telefone.trim()) {
      const telefoneExiste = await db.getAsync(
        'SELECT id FROM Clientes WHERE tenant_id = ? AND telefone = ? AND (email IS NULL OR LOWER(email) != ?)',
        [tenantId, telefone.trim(), email.trim().toLowerCase()]
      );
      if (telefoneExiste) {
        return res.status(400).json({ error: 'Este número de WhatsApp já está vinculado a outro cadastro nesta arena.' });
      }
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const rUser = await db.runAsync(
      `INSERT INTO Usuarios (nome, email, senha_hash, perfil, ativo)
       VALUES (?, ?, ?, 'Cliente', 1)`,
      [nome.trim(), email.trim().toLowerCase(), senhaHash]
    );

    const userId = rUser.lastID;

    let cliente = await db.getAsync(
      'SELECT id FROM Clientes WHERE tenant_id = ? AND (email = ? OR (telefone IS NOT NULL AND telefone = ?))',
      [tenantId, email.trim().toLowerCase(), telefone ? telefone.trim() : '']
    );

    if (!cliente) {
      try {
        await db.runAsync(
          'INSERT INTO Clientes (tenant_id, nome, email, telefone) VALUES (?, ?, ?, ?)',
          [tenantId, nome.trim(), email.trim().toLowerCase(), telefone ? telefone.trim() : null]
        );
      } catch (eCl) {
        /* ignora colisão de constraint se já existir */
      }
    }

    const token = jwt.sign(
      { id: userId, perfil: 'cliente', email: email.trim().toLowerCase() },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    logAuditEvent(
      userId,
      'Cadastro Atleta Publico',
      `Atleta '${nome}' cadastrou-se com sucesso no portal da arena '${arena.nome}'.`,
      req.ip
    );

    res.status(201).json({
      message: 'Cadastro realizado com sucesso!',
      token,
      usuario: {
        id: userId,
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        telefone: telefone ? telefone.trim() : ''
      }
    });
  } catch (err) {
    console.error('[Public Controller Error] cadastrarAtletaPublico:', err);
    res.status(500).json({ error: 'Erro ao realizar o cadastro do atleta.' });
  }
};

// 6. Login Real do Atleta via Portal Público por Tenant
const loginAtletaPublico = async (req, res) => {
  const { slug } = req.params;
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const arena = await db.getAsync('SELECT id, nome FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada ou indisponível.' });
    }

    const tenantId = arena.id;
    const bcrypt = require('bcrypt');
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';

    const usuario = await db.getAsync(
      'SELECT id, tenant_id, nome, email, senha_hash, perfil, ativo FROM Usuarios WHERE email = ?',
      [email.trim().toLowerCase()]
    );

    if (!usuario) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    if (usuario.ativo === 0) {
      return res.status(403).json({ error: 'Sua conta de usuário está desativada. Entre em contato com a arena.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const cliente = await db.getAsync('SELECT telefone, avatar_url FROM Clientes WHERE tenant_id = ? AND LOWER(email) = LOWER(?)', [tenantId, email.trim()]);

    const token = jwt.sign(
      { id: usuario.id, perfil: usuario.perfil, email: usuario.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    logAuditEvent(
      usuario.id,
      'Login Atleta Publico',
      `Atleta '${usuario.nome}' realizou login com sucesso no portal da arena '${arena.nome}'.`,
      req.ip
    );

    res.json({
      message: 'Login realizado com sucesso!',
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: cliente ? (cliente.telefone || '') : '',
        avatar_url: cliente ? (cliente.avatar_url || '') : ''
      }
    });
  } catch (err) {
    console.error('[Public Controller Error] loginAtletaPublico:', err);
    res.status(500).json({ error: 'Erro ao realizar login.' });
  }
};

async function obterOuCriarUsuarioGoogle({ email, nome, tenantId, bcrypt, crypto }) {
  let usuario = await db.getAsync('SELECT id, tenant_id, nome, email, perfil, ativo FROM Usuarios WHERE email = ?', [email]);

  if (!usuario) {
    const randomSecret = crypto.randomBytes(16).toString('hex');
    const senhaHashMock = await bcrypt.hash(`GOOGLE_OAUTH_${Date.now()}_${randomSecret}`, 10);
    const rUser = await db.runAsync(
      `INSERT INTO Usuarios (nome, email, senha_hash, perfil, ativo)
       VALUES (?, ?, ?, 'Cliente', 1)`,
      [nome, email, senhaHashMock]
    );
    usuario = {
      id: rUser.lastID,
      tenant_id: tenantId,
      nome,
      email,
      perfil: 'Cliente',
      ativo: 1
    };
  }
  return usuario;
}

// 7. Autenticação e Cadastro com Google OAuth 2.0 pelo Tenant
const googleAuthAtletaPublico = async (req, res) => {
  const { slug } = req.params;
  const { credential, email: bodyEmail, nome: bodyNome, telefone: bodyTelefone } = req.body;

  try {
    const arena = await db.getAsync('SELECT id, nome FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada ou indisponível.' });
    }

    const tenantId = arena.id;
    const jwt = require('jsonwebtoken');
    const bcrypt = require('bcrypt');
    const crypto = require('crypto');
    const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';

    let email = null;
    let nome = null;

    if (credential) {
      try {
        const decoded = jwt.decode(credential);
        if (decoded && decoded.email) {
          email = decoded.email;
          nome = decoded.name || decoded.given_name || email.split('@')[0];
        }
      } catch {
        return res.status(400).json({ error: 'Token do Google inválido.' });
      }
    } else if (process.env.NODE_ENV !== 'production' && bodyEmail) {
      email = bodyEmail;
      nome = bodyNome || email.split('@')[0];
    } else {
      return res.status(400).json({ error: 'Credencial do Google não informada.' });
    }

    if (!email) {
      return res.status(400).json({ error: 'E-mail do Google não identificado.' });
    }

    email = email.trim().toLowerCase();
    nome = (nome || email.split('@')[0]).trim();

    let usuario = await obterOuCriarUsuarioGoogle({ email, nome, tenantId, bcrypt, crypto });

    if (usuario.perfil !== 'Cliente') {
      return res.status(403).json({ error: 'Este e-mail pertence a uma conta de gestão. Acesse o painel pelo portal administrativo.' });
    }

    if (usuario.ativo === 0) {
      return res.status(403).json({ error: 'Sua conta de usuário está desativada. Entre em contato com a arena.' });
    }

    let cliente = await db.getAsync('SELECT id, telefone, avatar_url FROM Clientes WHERE tenant_id = ? AND LOWER(email) = LOWER(?)', [tenantId, email]);
    if (!cliente) {
      try {
        await db.runAsync(
          'INSERT INTO Clientes (tenant_id, nome, email, telefone) VALUES (?, ?, ?, ?)',
          [tenantId, nome, email, bodyTelefone ? bodyTelefone.trim() : null]
        );
      } catch (eCl) {
        /* ignora colisão de constraint se o cliente já existia */
      }
      cliente = await db.getAsync('SELECT id, telefone, avatar_url FROM Clientes WHERE tenant_id = ? AND LOWER(email) = LOWER(?)', [tenantId, email]);
    }

    const token = jwt.sign(
      { id: usuario.id, perfil: usuario.perfil, email: usuario.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    logAuditEvent(
      usuario.id,
      'Login Google Atleta Publico',
      `Atleta '${usuario.nome}' autenticou-se via Google na arena '${arena.nome}'.`,
      req.ip
    );

    res.json({
      message: 'Autenticação via Google realizada com sucesso!',
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: cliente ? (cliente.telefone || '') : '',
        avatar_url: cliente ? (cliente.avatar_url || '') : ''
      }
    });
  } catch (err) {
    console.error('[Public Controller Error] googleAuthAtletaPublico:', err);
    res.status(500).json({ error: 'Erro ao autenticar com o Google.' });
  }
};

// 8. Buscar Perfil do Atleta Logado
const getPerfilAtleta = async (req, res) => {
  const { slug } = req.params;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.split(' ')[1];
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const arena = await db.getAsync('SELECT id FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    const usuario = await db.getAsync('SELECT id, nome, email, perfil FROM Usuarios WHERE id = ?', [decoded.id]);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const cliente = await db.getAsync('SELECT id, telefone, cpf, avatar_url FROM Clientes WHERE LOWER(email) = LOWER(?) AND tenant_id = ?', [usuario.email, arena.id]);

    res.json({
      perfil: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: cliente ? (cliente.telefone || '') : '',
        cpf: cliente ? (cliente.cpf || '') : '',
        avatar_url: cliente ? (cliente.avatar_url || '') : ''
      }
    });
  } catch (err) {
    console.error('[Public Controller Error] getPerfilAtleta:', err);
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
};

async function atualizarTabelaUsuarios(usuarioId, nome, novaSenha, bcrypt) {
  const updatesUser = [];
  const paramsUser = [];

  if (nome && nome.trim()) {
    updatesUser.push('nome = ?');
    paramsUser.push(nome.trim());
  }

  if (novaSenha && novaSenha.length >= 6) {
    const senhaHash = await bcrypt.hash(novaSenha, 10);
    updatesUser.push('senha_hash = ?');
    paramsUser.push(senhaHash);
  }

  if (updatesUser.length > 0) {
    paramsUser.push(usuarioId);
    await db.runAsync(`UPDATE Usuarios SET ${updatesUser.join(', ')} WHERE id = ?`, paramsUser);
  }
}

async function sincronizarClienteTenant({ arenaId, usuario, nome, telefone, cpf, avatarUrl }) {
  const avatarToSave = (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim().length > 0) ? avatarUrl.trim() : null;

  let cliente = await db.getAsync('SELECT id, avatar_url FROM Clientes WHERE LOWER(email) = LOWER(?) AND tenant_id = ?', [usuario.email, arenaId]);
  if (cliente) {
    const finalAvatar = avatarToSave || cliente.avatar_url || null;
    await db.runAsync(
      'UPDATE Clientes SET nome = ?, telefone = ?, cpf = ?, avatar_url = ? WHERE id = ?',
      [nome ? nome.trim() : usuario.nome, telefone ? telefone.trim() : null, cpf ? cpf.trim() : null, finalAvatar, cliente.id]
    );
  } else {
    await db.runAsync(
      'INSERT INTO Clientes (tenant_id, nome, email, telefone, cpf, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      [arenaId, nome ? nome.trim() : usuario.nome, usuario.email, telefone ? telefone.trim() : null, cpf ? cpf.trim() : null, avatarToSave]
    );
  }
}

// 9. Atualizar Perfil e/ou Senha do Atleta
const atualizarPerfilAtleta = async (req, res) => {
  const { slug } = req.params;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.split(' ')[1];
  const jwt = require('jsonwebtoken');
  const bcrypt = require('bcrypt');
  const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';

  const { nome, telefone, cpf, nova_senha, avatar_url } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const arena = await db.getAsync('SELECT id, nome FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    const usuario = await db.getAsync('SELECT id, nome, email FROM Usuarios WHERE id = ?', [decoded.id]);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    await atualizarTabelaUsuarios(usuario.id, nome, nova_senha, bcrypt);

    if (telefone && telefone.trim()) {
      const telefoneExiste = await db.getAsync(
        'SELECT id FROM Clientes WHERE tenant_id = ? AND telefone = ? AND (email IS NULL OR LOWER(email) != ?)',
        [arena.id, telefone.trim(), usuario.email.toLowerCase()]
      );
      if (telefoneExiste) {
        return res.status(400).json({ error: 'Este número de WhatsApp já está vinculado a outro cadastro nesta arena.' });
      }
    }

    await sincronizarClienteTenant({
      arenaId: arena.id,
      usuario,
      nome,
      telefone,
      cpf,
      avatarUrl: avatar_url
    });

    logAuditEvent(
      usuario.id,
      'Atualizacao Perfil Atleta',
      `Atleta '${nome || usuario.nome}' atualizou seus dados cadastrais e/ou senha na arena '${arena.nome}'.`,
      req.ip
    );

    const clienteAtualizado = await db.getAsync('SELECT avatar_url FROM Clientes WHERE LOWER(email) = LOWER(?) AND tenant_id = ?', [usuario.email, arena.id]);

    res.json({
      message: 'Perfil atualizado com sucesso!',
      usuario: {
        id: usuario.id,
        nome: nome ? nome.trim() : usuario.nome,
        email: usuario.email,
        telefone: telefone ? telefone.trim() : '',
        cpf: cpf ? cpf.trim() : '',
        avatar_url: clienteAtualizado ? (clienteAtualizado.avatar_url || '') : ''
      }
    });
  } catch (err) {
    console.error('[Public Controller Error] atualizarPerfilAtleta:', err);
    res.status(500).json({ error: 'Erro ao atualizar perfil do atleta.' });
  }
};

async function consultarELiquidarMercadoPago(reservaId, arenaId, gatewayAccessToken) {
  const transacao = await db.getAsync('SELECT gateway_ref FROM TransacoesGateway WHERE reserva_id = ? AND status = "Pendente"', [reservaId]);
  if (!transacao?.gateway_ref || transacao.gateway_ref.startsWith('sim_') || transacao.gateway_ref.startsWith('PIX_')) {
    return null;
  }
  const token = gatewayAccessToken || process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${transacao.gateway_ref}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (mpRes.ok) {
      const mpData = await mpRes.json();
      if (mpData.status === 'approved') {
        const { processarLiquidacao } = require('../services/gatewayService');
        const payload = {};
        if (mpData.transaction_amount) payload.valor_pago = mpData.transaction_amount;
        await processarLiquidacao(transacao.gateway_ref, payload);
        return await db.getAsync('SELECT id, status, status_pagamento FROM Reservas WHERE id = ? AND tenant_id = ?', [reservaId, arenaId]);
      }
    }
  } catch (eMp) {
    console.warn('[Public Polling Warning] Erro ao consultar API do Mercado Pago:', eMp.message);
  }
  return null;
}

// 11. Consultar Status do Pagamento da Reserva para Polling do Pix
const getStatusReservaPublica = async (req, res) => {
  const { slug, reserva_id } = req.params;

  try {
    let reserva = await db.getAsync('SELECT id, tenant_id, status, status_pagamento FROM Reservas WHERE id = ?', [reserva_id]);
    if (!reserva) {
      return res.status(404).json({ error: 'Reserva não encontrada.' });
    }

    const arena = await db.getAsync('SELECT id, gateway_access_token FROM Arenas WHERE id = ? AND status = 1', [reserva.tenant_id]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    if (reserva.status_pagamento === 'Pendente') {
      const atualizada = await consultarELiquidarMercadoPago(reserva_id, arena.id, arena.gateway_access_token);
      if (atualizada) {
        reserva = atualizada;
      }
    }

    res.json({
      reserva_id: reserva.id,
      status: reserva.status,
      status_pagamento: reserva.status_pagamento
    });
  } catch (err) {
    console.error('[Public Controller Error] getStatusReservaPublica:', err);
    res.status(500).json({ error: 'Erro ao consultar status da reserva.' });
  }
};

// 12. Cancelar Reserva Pendente por Desistência Rápida (Ao Fechar Modal sem Pagar)
const cancelarPendentePublico = async (req, res) => {
  const { slug } = req.params;
  const { reserva_id, reservas_ids } = req.body;

  const idsParaCancelar = Array.isArray(reservas_ids) && reservas_ids.length > 0
    ? reservas_ids
    : reserva_id ? [reserva_id] : [];

  if (idsParaCancelar.length === 0) {
    return res.status(400).json({ error: 'Nenhuma reserva informada para cancelamento.' });
  }

  try {
    const arena = await db.getAsync('SELECT id FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    const placeholders = idsParaCancelar.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE Reservas 
       SET status = 'Cancelada', status_pagamento = 'Desistência' 
       WHERE tenant_id = ? AND status = 'Pendente' AND id IN (${placeholders})`,
      [arena.id, ...idsParaCancelar]
    );

    res.json({ message: 'Reserva(s) pendente(s) cancelada(s) com sucesso. Vaga liberada.' });
  } catch (err) {
    console.error('[Public Controller Error] cancelarPendentePublico:', err);
    res.status(500).json({ error: 'Erro ao cancelar reservas pendentes.' });
  }
};

// 13. Buscar Reservas do Atleta (por Token JWT ou por Telefone)
const getMinhasReservasAtleta = async (req, res) => {
  const { slug } = req.params;
  const { telefone } = req.query;
  const authHeader = req.headers.authorization;

  try {
    const arena = await db.getAsync('SELECT id FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    await expirarReservasAntigas();

    let emailsBusca = [];
    let telefonesBusca = [];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.email) {
          emailsBusca.push(decoded.email.trim().toLowerCase());
        }
        if (decoded && decoded.id) {
          const userObj = await db.getAsync('SELECT email, telefone FROM Usuarios WHERE id = ?', [decoded.id]);
          if (userObj) {
            if (userObj.email) emailsBusca.push(userObj.email.trim().toLowerCase());
            if (userObj.telefone) {
              telefonesBusca.push(userObj.telefone.trim());
              const digits = userObj.telefone.replace(/\D/g, '');
              if (digits) telefonesBusca.push(digits);
            }
          }
        }
      } catch (e) { }
    }

    if (telefone && telefone.trim() && telefone.trim() !== '(00) 00000-0000') {
      const phoneTrim = telefone.trim();
      telefonesBusca.push(phoneTrim);
      const digits = phoneTrim.replace(/\D/g, '');
      if (digits) telefonesBusca.push(digits);
    }

    emailsBusca = [...new Set(emailsBusca)];
    telefonesBusca = [...new Set(telefonesBusca)];

    if (emailsBusca.length === 0 && telefonesBusca.length === 0) {
      return res.json([]);
    }

    const emailPlaceholders = emailsBusca.length > 0 ? emailsBusca.map(() => '?').join(',') : "''";
    const phonePlaceholders = telefonesBusca.length > 0 ? telefonesBusca.map(() => '?').join(',') : "''";

    const clientes = await db.allAsync(
      `SELECT id FROM Clientes 
       WHERE tenant_id = ? 
         AND (
           (${emailsBusca.length > 0 ? `LOWER(email) IN (${emailPlaceholders})` : '1=0'}) 
           OR (${telefonesBusca.length > 0 ? `telefone IN (${phonePlaceholders}) OR REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), ' ', ''), '-', '') IN (${phonePlaceholders})` : '1=0'})
         )`,
      [arena.id, ...emailsBusca, ...telefonesBusca, ...telefonesBusca]
    );

    const clientIds = clientes.map(c => c.id);
    if (clientIds.length === 0) {
      return res.json([]);
    }

    const arenaInfo = await db.getAsync('SELECT id, nome, endereco, telefone, email, chave_pix, titular_pix FROM Arenas WHERE id = ?', [arena.id]);

    const reservas = await db.allAsync(
      `SELECT MIN(r.id) as id, r.grupo_id, r.quadra_id, q.nome as quadra_nome, r.data_reserva, 
              MIN(r.hora_inicio) as hora_inicio, MAX(r.hora_fim) as hora_fim, 
              SUM(r.valor_total) as valor_total, COUNT(r.id) as total_horarios,
              CASE 
                WHEN MAX(CASE WHEN r.status != 'Cancelada' THEN 1 ELSE 0 END) = 0 THEN 'Cancelada'
                WHEN MAX(CASE WHEN r.status = 'Confirmada' THEN 1 ELSE 0 END) = 1 THEN 'Confirmada'
                ELSE 'Pendente'
              END as status,
              CASE 
                WHEN MAX(CASE WHEN r.status_pagamento = 'Pago' THEN 1 ELSE 0 END) = 1 THEN 'Pago'
                WHEN MAX(CASE WHEN r.status = 'Cancelada' OR r.status_pagamento IN ('Estornado', 'Expirado', 'Cancelado (Pendente Estorno)', 'Desistência', 'Cancelado') THEN 1 ELSE 0 END) = 1 THEN MAX(r.status_pagamento)
                ELSE 'Pendente'
              END as status_pagamento,
              MAX(r.criado_em) as criado_em, r.codigo_validacao_cancelamento,
              c.nome as cliente_nome, c.email as cliente_email, c.telefone as cliente_telefone, c.cpf as cliente_cpf,
              tg.gateway_ref, tg.metodo as metodo_gateway, tg.status as status_gateway, tg.atualizado_em as data_gateway,
              p.metodo as metodo_pagamento, p.registrado_em as data_pagamento
       FROM Reservas r
       JOIN Quadras q ON r.quadra_id = q.id
       JOIN Clientes c ON r.cliente_id = c.id
       LEFT JOIN (
         SELECT tg1.reserva_id, tg1.gateway_ref, tg1.metodo, tg1.status, tg1.atualizado_em
         FROM TransacoesGateway tg1
         INNER JOIN (
           SELECT reserva_id, MAX(id) as max_id FROM TransacoesGateway GROUP BY reserva_id
         ) tg2 ON tg1.id = tg2.max_id
       ) tg ON r.id = tg.reserva_id
       LEFT JOIN (
         SELECT p1.reserva_id, p1.metodo, p1.registrado_em
         FROM Pagamentos p1
         INNER JOIN (
           SELECT reserva_id, MAX(id) as max_id FROM Pagamentos GROUP BY reserva_id
         ) p2 ON p1.id = p2.max_id
       ) p ON r.id = p.reserva_id
       WHERE r.tenant_id = ? AND r.cliente_id IN (${clientIds.map(() => '?').join(',')})
       GROUP BY COALESCE(NULLIF(r.grupo_id, ''), CAST(r.id AS TEXT))
       ORDER BY CASE 
                  WHEN MAX(CASE WHEN r.status = 'Cancelada' OR r.status_pagamento IN ('Estornado', 'Expirado', 'Cancelado (Pendente Estorno)', 'Desistência') THEN 1 ELSE 0 END) = 1 AND MAX(CASE WHEN r.status = 'Confirmada' OR r.status_pagamento = 'Pago' THEN 1 ELSE 0 END) = 0 THEN 3
                  WHEN (MIN(r.status) = 'Pendente' OR MIN(r.status_pagamento) = 'Pendente') AND r.data_reserva >= date('now', 'localtime') THEN 0
                  WHEN r.data_reserva >= date('now', 'localtime') THEN 1
                  ELSE 2 
                END, 
                CASE WHEN r.data_reserva >= date('now', 'localtime') THEN r.data_reserva END ASC,
                CASE WHEN r.data_reserva >= date('now', 'localtime') THEN MIN(r.hora_inicio) END ASC,
                r.data_reserva DESC, 
                MIN(r.hora_inicio) DESC`,
      [arena.id, ...clientIds]
    );

    const result = reservas.map(r => ({
      ...r,
      arena: {
        nome: arenaInfo?.nome || 'Arena',
        endereco: arenaInfo?.endereco || '',
        telefone: arenaInfo?.telefone || '',
        email: arenaInfo?.email || '',
        titular_pix: arenaInfo?.titular_pix || arenaInfo?.nome || ''
      }
    }));

    res.json(result);
  } catch (err) {
    console.error('[Public Controller Error] getMinhasReservasAtleta:', err);
    res.status(500).json({ error: 'Erro ao buscar reservas do atleta.' });
  }
};

// 14. Solicitar Recuperação de Senha do Atleta
const solicitarRecuperacaoSenhaAtleta = async (req, res) => {
  const { slug } = req.params;
  const { email } = req.body;

  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'E-mail é obrigatório.' });
  }

  try {
    const arena = await db.getAsync('SELECT id, nome FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    const emailTrim = email.trim().toLowerCase();
    const usuario = await db.getAsync('SELECT id, nome, email FROM Usuarios WHERE email = ?', [emailTrim]);

    const successMsg = 'Se o e-mail informado estiver cadastrado, o código de recuperação de 6 dígitos foi enviado.';

    if (!usuario) {
      return res.json({ message: successMsg });
    }

    const crypto = require('crypto');
    const codigo6Digits = crypto.randomInt(100000, 1000000).toString();
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await db.runAsync(
      'UPDATE Usuarios SET reset_password_token = ?, reset_password_expires = ? WHERE id = ?',
      [`${codigo6Digits}:${token}`, expires, usuario.id]
    );

    logAuditEvent(usuario.id, 'Solicitação Recuperação Senha Atleta', `Arena: ${arena.nome}, E-mail: ${usuario.email}`, req.ip);

    (async () => {
      try {
        const { sendEmail } = require('../services/emailService');
        const subject = `Código de Recuperação: ${codigo6Digits} - ${arena.nome}`;
        const html = `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
            <h2 style="color: #1a202c;">Olá, ${usuario.nome}! 👋</h2>
            <p>Você solicitou a redefinição de senha para o seu acesso na <strong>${arena.nome}</strong>.</p>
            <p>Seu código de verificação é:</p>
            <div style="margin: 20px 0; text-align: center;">
              <span style="background-color: #f7fafc; border: 2px dashed #cbd5e0; color: #2d3748; padding: 12px 24px; font-size: 28px; font-weight: bold; letter-spacing: 6px; border-radius: 8px; display: inline-block;">${codigo6Digits}</span>
            </div>
            <p style="font-size: 0.9em; color: #e53e3e; font-weight: bold;">Este código é válido por 15 minutos.</p>
            <p style="font-size: 0.85em; color: #718096;">Se você não fez essa solicitação, ignore este e-mail.</p>
          </div>
        `;
        await sendEmail(usuario.email, subject, html);
      } catch (e) {
        console.error('[SMTP] Erro ao enviar código de recuperação:', e.message);
      }
    })();

    res.json({ message: successMsg });
  } catch (err) {
    console.error('[Public Controller Error] solicitarRecuperacaoSenhaAtleta:', err);
    res.status(500).json({ error: 'Erro ao processar solicitação de recuperação.' });
  }
};

// 15. Redefinir Senha do Atleta
const redefinirSenhaAtleta = async (req, res) => {
  const { slug } = req.params;
  const { email, codigo, nova_senha } = req.body;

  if (!email || !codigo || !nova_senha) {
    return res.status(400).json({ error: 'E-mail, código de verificação e nova senha são obrigatórios.' });
  }

  if (nova_senha.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
  }

  try {
    const arena = await db.getAsync('SELECT id FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    const emailTrim = email.trim().toLowerCase();
    const codigoTrim = codigo.trim();

    const usuario = await db.getAsync(
      `SELECT id, nome, email, reset_password_token, reset_password_expires 
       FROM Usuarios 
       WHERE email = ? AND reset_password_expires > datetime('now')`,
      [emailTrim]
    );

    if (!usuario || !usuario.reset_password_token) {
      return res.status(400).json({ error: 'Código de recuperação inválido ou expirado.' });
    }

    const savedCode = usuario.reset_password_token.split(':')[0];
    if (savedCode !== codigoTrim && usuario.reset_password_token !== codigoTrim) {
      return res.status(400).json({ error: 'Código de verificação incorreto.' });
    }

    const bcrypt = require('bcrypt');
    const senhaHash = await bcrypt.hash(nova_senha, 10);

    await db.runAsync(
      `UPDATE Usuarios 
       SET senha_hash = ?, reset_password_token = NULL, reset_password_expires = NULL 
       WHERE id = ?`,
      [senhaHash, usuario.id]
    );

    logAuditEvent(usuario.id, 'Redefinição Senha Atleta Concluída', `E-mail: ${usuario.email}`, req.ip);

    res.json({ message: 'Sua senha foi redefinida com sucesso! Você já pode fazer login.' });
  } catch (err) {
    console.error('[Public Controller Error] redefinirSenhaAtleta:', err);
    res.status(500).json({ error: 'Erro ao redefinir a senha do atleta.' });
  }
};

function calcularExpiracaoSegundos(criadoEm) {
  const criadoEmRaw = criadoEm ? String(criadoEm).replace(' ', 'T') : new Date().toISOString();
  const criadoEmStr = criadoEmRaw.endsWith('Z') ? criadoEmRaw : `${criadoEmRaw}Z`;
  const criadoEmTime = new Date(criadoEmStr).getTime();
  const agoraTime = Date.now();
  const decorridoSegundos = Math.max(0, Math.floor((agoraTime - criadoEmTime) / 1000));
  const restanteSegundos = Math.max(0, (15 * 60) - decorridoSegundos);
  const expiraEmMinutos = Math.ceil(restanteSegundos / 60);
  return { restanteSegundos, expiraEmMinutos };
}

async function resolverPixDados(reserva, arena) {
  let transacao = await db.getAsync('SELECT gateway_ref FROM TransacoesGateway WHERE reserva_id = ? ORDER BY id DESC', [reserva.id]);
  let gatewayRef = transacao?.gateway_ref || `PIX_${reserva.id}_${Date.now()}`;
  let copiaCola = null;
  let qrCode = null;

  if (arena.gateway_access_token) {
    try {
      const pixData = await criarCobrancaPix(reserva.id, reserva.valor_total, arena.id);
      if (pixData) {
        gatewayRef = pixData.gateway_ref || gatewayRef;
        copiaCola = pixData.copia_cola;
        qrCode = pixData.qr_code;
      }
    } catch (eGateway) {
      const safeMsg = String(eGateway?.message || '').replace(/[\r\n]/g, '');
      console.warn('[Public Controller Warning] Erro ao re-gerar Pix via gatewayService:', safeMsg);
    }
  }

  if (!copiaCola) {
    if (!arena.chave_pix?.trim()) {
      return { errorConfig: true };
    }
    copiaCola = gerarPixEMV({
      chave: arena.chave_pix.trim(),
      nome: arena.titular_pix || arena.nome || 'Arena',
      cidade: arena.cidade_pix || 'SAO PAULO',
      valor: reserva.valor_total,
      txid: `RES${reserva.id}`
    });
  }

  if (!qrCode) {
    qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(copiaCola)}`;
  }

  return { gatewayRef, copiaCola, qrCode };
}

// 16. Recuperar/Obter Dados do Pix de uma Reserva Pendente
const obterPixReservaPendente = async (req, res) => {
  const { slug, reserva_id } = req.params;

  try {
    const arena = await db.getAsync(
      'SELECT id, nome, email, telefone, chave_pix, titular_pix, cidade_pix, gateway_access_token FROM Arenas WHERE slug = ? AND status = 1',
      [slug]
    );
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    await expirarReservasAntigas();

    const reserva = await db.getAsync(
      `SELECT r.id, r.tenant_id, r.cliente_id, r.quadra_id, q.nome as quadra_nome, 
              r.data_reserva, r.hora_inicio, r.hora_fim, r.valor_total, 
              r.status, r.status_pagamento, r.criado_em,
              c.nome as cliente_nome, c.email as cliente_email, c.telefone as cliente_telefone, c.cpf as cliente_cpf
       FROM Reservas r
       JOIN Quadras q ON r.quadra_id = q.id
       LEFT JOIN Clientes c ON r.cliente_id = c.id
       WHERE r.id = ? AND r.tenant_id = ?`,
      [reserva_id, arena.id]
    );

    if (!reserva) {
      return res.status(404).json({ error: 'Reserva não encontrada.' });
    }

    if (reserva.status === 'Cancelada' || reserva.status_pagamento === 'Expirado') {
      return res.status(400).json({ error: 'Esta reserva foi cancelada ou expirou por falta de pagamento.' });
    }

    if (reserva.status_pagamento === 'Pago') {
      return res.json({
        reserva_id: reserva.id,
        status: reserva.status,
        status_pagamento: 'Pago',
        message: 'Esta reserva já foi paga com sucesso!'
      });
    }

    const pixDados = await resolverPixDados(reserva, arena);
    if (pixDados.errorConfig) {
      return res.status(400).json({
        payment_not_configured: true,
        telefone_arena: arena.telefone || null,
        error: 'Esta arena não tem uma chave Pix configurada. Entre em contato com a recepção.'
      });
    }

    const { restanteSegundos, expiraEmMinutos } = calcularExpiracaoSegundos(reserva.criado_em);

    res.json({
      reserva_id: reserva.id,
      quadra_nome: reserva.quadra_nome,
      data_reserva: reserva.data_reserva,
      hora_inicio: reserva.hora_inicio,
      hora_fim: reserva.hora_fim,
      valor_total: reserva.valor_total,
      status: reserva.status,
      status_pagamento: reserva.status_pagamento,
      gateway_ref: pixDados.gatewayRef,
      copia_cola: pixDados.copiaCola,
      qr_code: pixDados.qrCode,
      expira_em_minutos: expiraEmMinutos,
      expira_em_segundos: restanteSegundos
    });
  } catch (err) {
    console.error('[Public Controller Error] obterPixReservaPendente:', err);
    res.status(500).json({ error: 'Erro ao consultar dados do Pix da reserva.' });
  }
};

async function validarPropriedadeReserva(reserva, usuario, arenaId) {
  const emailUsuario = (usuario.email || '').trim().toLowerCase();
  const emailReserva = (reserva.cliente_email || '').trim().toLowerCase();

  if (emailUsuario !== '' && emailReserva !== '' && emailUsuario === emailReserva) {
    return true;
  }

  const clienteVinc = await db.getAsync(
    'SELECT id FROM Clientes WHERE id = ? AND tenant_id = ? AND LOWER(email) = ?',
    [reserva.cliente_id, arenaId, emailUsuario]
  );
  return !!clienteVinc;
}

async function processarEstornoCancelamento({ reserva, arena, grupoClause, grupoParams, codigoValidacao }) {
  if (reserva.status_pagamento !== 'Pago') {
    await db.runAsync(
      `UPDATE Reservas 
       SET status = 'Cancelada', codigo_validacao_cancelamento = ?, observacoes_cancelamento = 'Cancelado pelo cliente'
       ${grupoClause}`,
      [codigoValidacao, ...grupoParams]
    );
    return { estornoStatus: 'none', mensagemDevolucao: 'Reserva cancelada com sucesso.' };
  }

  const { estornarPagamentoPix } = require('../services/gatewayService');
  const estornoMp = await estornarPagamentoPix(reserva.id, arena.id);

  if (estornoMp && estornoMp.success) {
    await db.runAsync(
      `UPDATE Reservas 
       SET status = 'Cancelada', status_pagamento = 'Estornado', 
           codigo_validacao_cancelamento = ?, observacoes_cancelamento = 'Cancelado pelo cliente (Estorno MP Automático)'
       ${grupoClause}`,
      [codigoValidacao, ...grupoParams]
    );
    await db.runAsync(
      "INSERT INTO Pagamentos (reserva_id, valor, metodo, registrado_por) VALUES (?, ?, 'Estorno', NULL)",
      [reserva.id, -reserva.valor_total]
    );
    return {
      estornoStatus: 'automatic',
      mensagemDevolucao: 'Reserva cancelada e valor estornado automaticamente via Pix pelo Mercado Pago!'
    };
  }

  await db.runAsync(
    `UPDATE Reservas 
     SET status = 'Cancelada', status_pagamento = 'Cancelado (Pendente Estorno)', 
         codigo_validacao_cancelamento = ?, observacoes_cancelamento = 'Cancelado pelo cliente (Pendente Estorno Manual)'
     ${grupoClause}`,
    [codigoValidacao, ...grupoParams]
  );
  return {
    estornoStatus: 'manual',
    mensagemDevolucao: 'Reserva cancelada. Entre em contato com a arena via WhatsApp para realizar o estorno do Pix.'
  };
}

const cancelarReservaAtleta = async (req, res) => {
  const { slug, id } = req.params;
  const reservaId = parseInt(id, 10);

  if (!reservaId || isNaN(reservaId)) {
    return res.status(400).json({ error: 'ID de reserva inválido.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Você precisa estar logado para cancelar uma reserva.' });
  }

  const token = authHeader.split(' ')[1];
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (errJwt) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente para cancelar a reserva.' });
  }

  try {
    const arena = await db.getAsync('SELECT id, nome, telefone, email FROM Arenas WHERE slug = ? AND status = 1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    const usuario = await db.getAsync('SELECT id, nome, email FROM Usuarios WHERE id = ?', [decoded.id]);
    if (!usuario) {
      return res.status(401).json({ error: 'Usuário autenticado não encontrado.' });
    }

    const reserva = await db.getAsync(
      `SELECT r.*, q.nome as quadra_nome, c.nome as cliente_nome, c.email as cliente_email, c.telefone as cliente_telefone, c.cpf as cliente_cpf
       FROM Reservas r
       JOIN Quadras q ON r.quadra_id = q.id
       JOIN Clientes c ON r.cliente_id = c.id
       WHERE r.id = ? AND r.tenant_id = ?`,
      [reservaId, arena.id]
    );

    if (!reserva) {
      return res.status(404).json({ error: 'Reserva não encontrada.' });
    }

    const isOwner = await validarPropriedadeReserva(reserva, usuario, arena.id);
    if (!isOwner) {
      logAuditEvent(
        usuario.id,
        'Tentativa IDOR Cancelamento Bloqueada',
        `Usuário '${usuario.nome}' (ID ${usuario.id}) tentou cancelar a reserva #${reserva.id} pertencente ao cliente '${reserva.cliente_nome}'.`,
        req.ip
      );
      return res.status(403).json({ error: 'Acesso negado. Esta reserva não pertence à sua conta.' });
    }

    let grupoClause = 'WHERE id = ? AND tenant_id = ?';
    let grupoParams = [reserva.id, arena.id];

    if (reserva.grupo_id && String(reserva.grupo_id).trim() !== '') {
      grupoClause = 'WHERE grupo_id = ? AND tenant_id = ?';
      grupoParams = [reserva.grupo_id, arena.id];

      const grupoReservas = await db.allAsync(
        `SELECT status FROM Reservas WHERE grupo_id = ? AND tenant_id = ?`,
        [reserva.grupo_id, arena.id]
      );
      if (grupoReservas.length > 0 && grupoReservas.every(r => r.status === 'Cancelada')) {
        return res.status(400).json({ error: 'Esta reserva já se encontra cancelada.' });
      }
    } else if (reserva.status === 'Cancelada') {
      return res.status(400).json({ error: 'Esta reserva já se encontra cancelada.' });
    }

    const todayStr = getTodayString();
    const currentTimeStr = getLocalTimeString();

    if (reserva.data_reserva < todayStr || (reserva.data_reserva === todayStr && reserva.hora_inicio <= currentTimeStr)) {
      return res.status(400).json({ error: 'Não é possível cancelar uma reserva de data ou horário que já passou.' });
    }

    const crypto = require('crypto');
    const codigoValidacao = 'VAL-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const { estornoStatus, mensagemDevolucao } = await processarEstornoCancelamento({
      reserva,
      arena,
      grupoClause,
      grupoParams,
      codigoValidacao
    });

    res.json({
      success: true,
      status: 'Cancelada',
      refund_status: estornoStatus,
      message: mensagemDevolucao,
      codigo_validacao: codigoValidacao,
      arena: {
        nome: arena.nome,
        telefone: arena.telefone || ''
      },
      reserva: {
        id: reserva.id,
        quadra_nome: reserva.quadra_nome,
        data_reserva: reserva.data_reserva,
        hora_inicio: reserva.hora_inicio,
        hora_fim: reserva.hora_fim,
        valor_total: reserva.valor_total,
        cliente_nome: reserva.cliente_nome,
        cliente_email: reserva.cliente_email,
        cliente_telefone: reserva.cliente_telefone,
        cliente_cpf: reserva.cliente_cpf || 'Não informado'
      }
    });
  } catch (err) {
    console.error('[Public Controller Error] cancelarReservaAtleta:', err);
    res.status(500).json({ error: 'Erro ao processar o cancelamento da reserva.' });
  }
};

// Exclusão Definitiva de Conta de Atleta (LGPD) — Requer Autenticação Estrita JWT
const excluirContaAtleta = async (req, res) => {
  const { slug } = req.params;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Você precisa estar autenticado para solicitar a exclusão da sua conta.' });
  }

  const token = authHeader.split(' ')[1];
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-courtmanager-2026';

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (errJwt) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente para prosseguir com a exclusão.' });
  }

  try {
    const arena = await db.getAsync('SELECT id, nome FROM Arenas WHERE slug = ? AND status != -1', [slug]);
    if (!arena) {
      return res.status(404).json({ error: 'Arena não encontrada.' });
    }

    const usuario = await db.getAsync('SELECT id, nome, email, telefone FROM Usuarios WHERE id = ?', [decoded.id]);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const emailUsuario = (usuario.email || '').trim().toLowerCase();

    // Localiza o cliente vinculado nesta arena
    let cliente = await db.getAsync(
      'SELECT id, nome, email, telefone FROM Clientes WHERE tenant_id = ? AND LOWER(email) = ?',
      [arena.id, emailUsuario]
    );

    if (!cliente && usuario.telefone) {
      const cleanPhone = usuario.telefone.replace(/\D/g, '');
      cliente = await db.getAsync(
        'SELECT id, nome, email, telefone FROM Clientes WHERE tenant_id = ? AND (telefone = ? OR (telefone LIKE ? AND length(?) >= 8))',
        [arena.id, usuario.telefone, `%${cleanPhone.slice(-8)}`, cleanPhone]
      );
    }

    if (cliente) {
      // 1. Anonimizar Reservas antigas (Manter Faturamento & Relatórios de Caixa da Arena)
      await db.runAsync(
        `UPDATE Reservas 
         SET cliente_nome = 'Cliente Removido (LGPD)',
             cliente_email = NULL,
             cliente_telefone = NULL,
             cliente_cpf = NULL,
             cliente_id = NULL
         WHERE tenant_id = ? AND (cliente_id = ? OR (cliente_email IS NOT NULL AND LOWER(cliente_email) = ?))`,
        [arena.id, cliente.id, emailUsuario]
      );

      // 2. Excluir vínculo de cliente nesta arena
      await db.runAsync('DELETE FROM Clientes WHERE id = ?', [cliente.id]);
    }

    // 3. Desativar a conta do usuário global
    await db.runAsync('UPDATE Usuarios SET ativo = 0, nome = \'Conta Excluída\', email = ? WHERE id = ?', [`deleted_${usuario.id}_${Date.now()}@anon.local`, usuario.id]);

    // 4. Registrar Audit Log
    try {
      logAuditEvent(
        usuario.id,
        'LGPD_EXCLUSAO_CONTA',
        `Atleta ID ${usuario.id} (${usuario.nome} / ${usuario.email}) excluiu definitivamente seus dados sob LGPD na arena '${arena.nome}'.`,
        req.ip
      );
    } catch (e) {
      console.warn('[LGPD Audit Warning]', e.message);
    }

    res.json({
      success: true,
      message: 'Sua conta e seus dados pessoais foram excluídos permanentemente com sucesso.'
    });
  } catch (err) {
    console.error('[Public Controller Error] excluirContaAtleta:', err);
    res.status(500).json({ error: 'Erro ao processar a exclusão da conta. Tente novamente.' });
  }
};

module.exports = {
  getTenantBySlug,
  getQuadrasBySlug,
  getDisponibilidadeBySlug,
  agendarReservaPublica,
  cadastrarAtletaPublico,
  loginAtletaPublico,
  googleAuthAtletaPublico,
  getPerfilAtleta,
  atualizarPerfilAtleta,
  getStatusReservaPublica,
  cancelarPendentePublico,
  getMinhasReservasAtleta,
  solicitarRecuperacaoSenhaAtleta,
  redefinirSenhaAtleta,
  obterPixReservaPendente,
  cancelarReservaAtleta,
  excluirContaAtleta
};



