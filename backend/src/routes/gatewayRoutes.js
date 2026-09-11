const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const db = require('../config/database');
const { criarCobrancaPix, criarCobrancaCartao, criarCobrancaMaquineta, processarLiquidacao } = require('../services/gatewayService');

// Criar cobrança para uma reserva (Pix, Cartão ou Maquineta)
async function validarReservaECalcularValorCobrar(reserva_id, user, valorParam) {
  const reserva = await db.getAsync('SELECT valor_total, tenant_id, cliente_id, status FROM Reservas WHERE id = ?', [reserva_id]);
  if (!reserva) {
    throw { status: 404, message: 'Reserva não encontrada.' };
  }

  if (user.perfil === 'Cliente' && reserva.cliente_id !== user.cliente_id) {
    throw { status: 403, message: 'Acesso negado. Esta reserva não pertence à sua conta.' };
  }

  if (reserva.status === 'Cancelada') {
    throw { status: 400, message: 'Não é possível pagar por uma reserva que já está cancelada.' };
  }

  const resultPagamentos = await db.getAsync('SELECT SUM(valor) as total_pago FROM Pagamentos WHERE reserva_id = ?', [reserva_id]);
  const totalPago = resultPagamentos.total_pago || 0;
  const saldoRestante = reserva.valor_total - totalPago;

  if (saldoRestante <= 0) {
    throw { status: 400, message: 'Esta reserva já está totalmente paga.' };
  }

  let valorCobrar = saldoRestante;
  if (valorParam !== undefined && valorParam !== null && Number.parseFloat(valorParam) > 0) {
    const valorCustom = Number.parseFloat(valorParam);
    if (valorCustom > saldoRestante + 0.01) {
      throw { status: 400, message: `O valor informado (R$ ${valorCustom.toFixed(2)}) não pode ser maior que o saldo devedor (R$ ${saldoRestante.toFixed(2)}).` };
    }
    valorCobrar = valorCustom;
  }

  return { reserva, valorCobrar };
}

async function gerarCobrancaPorMetodo(metodo, reserva_id, valorCobrar, card_data, tenant_id) {
  const mapaGateway = {
    'pix': 'Pix',
    'pix online': 'Pix',
    'pix online (gateway)': 'Pix',
    'cartão': 'Cartão',
    'cartao': 'Cartão',
    'cartão de crédito': 'Cartão',
    'credito': 'Cartão',
    'maquineta': 'Maquineta',
    'cartão (maquineta)': 'Maquineta',
    'cartão (maquineta online)': 'Maquineta'
  };

  const metodoNormalizado = mapaGateway[metodo ? metodo.toLowerCase().trim() : ''] || metodo;

  if (metodoNormalizado === 'Pix') {
    return await criarCobrancaPix(reserva_id, valorCobrar, tenant_id);
  }
  if (metodoNormalizado === 'Cartão') {
    return await criarCobrancaCartao(reserva_id, valorCobrar, card_data, tenant_id);
  }
  if (metodoNormalizado === 'Maquineta') {
    return await criarCobrancaMaquineta(reserva_id, valorCobrar, tenant_id);
  }
  throw { status: 400, message: 'Método inválido. Escolha "Pix", "Cartão" ou "Maquineta".' };
}

// Criar cobrança para uma reserva (Pix, Cartão ou Maquineta)
router.post('/cobranca', verifyToken, async (req, res) => {
  try {
    const { reserva_id, metodo, card_data, valor } = req.body;

    if (!reserva_id || !metodo) {
      return res.status(400).json({ error: 'Os campos reserva_id e metodo são obrigatórios.' });
    }

    const { reserva, valorCobrar } = await validarReservaECalcularValorCobrar(reserva_id, req.user, valor);
    const cobranca = await gerarCobrancaPorMetodo(metodo, reserva_id, valorCobrar, card_data, reserva.tenant_id);
    return res.json(cobranca);

  } catch (error) {
    console.error('[Gateway Routes Error]', error);
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Erro ao gerar cobrança de pagamento.' });
  }
});

// Polling: Obter o status atual do pagamento da reserva
router.get('/status/:reserva_id', verifyToken, async (req, res) => {
  try {
    const { reserva_id } = req.params;
    const reserva = await db.getAsync('SELECT status, status_pagamento, cliente_id FROM Reservas WHERE id = ?', [reserva_id]);

    if (!reserva) {
      return res.status(404).json({ error: 'Reserva não encontrada.' });
    }

    if (req.user.perfil === 'Cliente' && reserva.cliente_id !== req.user.cliente_id) {
      return res.status(403).json({ error: 'Acesso negado. Esta reserva não pertence à sua conta.' });
    }

    res.json({
      status: reserva.status,
      status_pagamento: reserva.status_pagamento
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar status da transação.' });
  }
});

// Simular pagamento (Útil apenas para desenvolvimento/testes e demonstração)
router.post('/simular-pagamento', verifyToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production' && req.user.perfil !== 'SuperAdmin') {
    return res.status(403).json({ error: 'A simulação de pagamentos está desabilitada em ambiente de produção.' });
  }

  try {
    const { gateway_ref, device_id, valor_pago } = req.body;
    if (!gateway_ref) {
      return res.status(400).json({ error: 'O campo gateway_ref é obrigatório.' });
    }

    const payload = {};
    if (device_id !== undefined) payload.device_id = device_id;
    if (valor_pago !== undefined) payload.valor_pago = valor_pago;

    const resultado = await processarLiquidacao(gateway_ref, payload);
    res.json({ message: 'Pagamento simulado e liquidado com sucesso.', ...resultado });

  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || 'Erro ao simular liquidação.' });
  }
});

// Consultar as Configurações de Gateway da Arena (Maquineta e Credenciais)
router.get('/maquineta', verifyToken, async (req, res) => {
  try {
    const arena = await db.getAsync('SELECT gateway_device_id, gateway_access_token, gateway_public_key FROM Arenas WHERE id = ?', [req.user.tenant_id]);
    res.json({ 
      gateway_device_id: arena ? arena.gateway_device_id : null,
      gateway_access_token: arena ? arena.gateway_access_token : null,
      gateway_public_key: arena ? arena.gateway_public_key : null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao consultar configurações de pagamento.' });
  }
});

// Configurar/Atualizar o Serial Number e Credenciais de Pagamento da Arena
router.post('/maquineta', verifyToken, async (req, res) => {
  try {
    const { gateway_device_id, gateway_access_token, gateway_public_key } = req.body;
    if (req.user.perfil !== 'Administrador' && req.user.perfil !== 'Gerente') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores ou gerentes podem configurar pagamentos.' });
    }

    // Validação básica do serial number
    if (gateway_device_id && !/^[a-zA-Z0-9_-]{4,64}$/.test(gateway_device_id)) {
      return res.status(400).json({ error: 'Formato de Serial Number de maquineta inválido. Use letras, números, hífen e underline (4-64 caracteres).' });
    }

    await db.runAsync(
      'UPDATE Arenas SET gateway_device_id = ?, gateway_access_token = ?, gateway_public_key = ? WHERE id = ?', 
      [gateway_device_id || null, gateway_access_token || null, gateway_public_key || null, req.user.tenant_id]
    );

    res.json({ message: 'Configuração da maquineta física atualizada com sucesso.' });
  } catch (error) {
    console.error('[Gateway Maquineta Config Error]', error);
    res.status(500).json({ error: 'Erro ao configurar dispositivo.' });
  }
});

async function resolverTokenWebhookMercadoPago(paymentId) {
  const transacao = await db.getAsync('SELECT reserva_id FROM TransacoesGateway WHERE gateway_ref = ?', [paymentId]);
  let token = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (transacao) {
    const reserva = await db.getAsync('SELECT tenant_id FROM Reservas WHERE id = ?', [transacao.reserva_id]);
    if (reserva?.tenant_id) {
      const arena = await db.getAsync('SELECT gateway_access_token FROM Arenas WHERE id = ?', [reserva.tenant_id]);
      if (arena?.gateway_access_token?.trim()) {
        token = arena.gateway_access_token.trim();
      }
    }
  }
  return token;
}

async function liquidarWebhookMercadoPago(paymentId, token) {
  if (!token || !paymentId) return;
  const safePaymentId = String(paymentId).trim();
  if (!/^\d+$/.test(safePaymentId)) return;
  const encodedPaymentId = encodeURIComponent(safePaymentId);

  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodedPaymentId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (mpRes.ok) {
    const mpData = await mpRes.json();
    if (mpData.status === 'approved') {
      const payload = {};
      if (mpData.pos_id) payload.device_id = mpData.pos_id;
      if (mpData.transaction_amount) payload.valor_pago = mpData.transaction_amount;
      await processarLiquidacao(safePaymentId, payload);
    }
  }
}

// Webhook oficial (Chamado pelo Mercado Pago ou provedor configurado)
router.post('/webhook', async (req, res) => {
  try {
    const { action, data } = req.body;
    const isPaymentEvent = action === 'payment.created' || action === 'payment.updated' || req.query.topic === 'payment' || req.query.type === 'payment';

    if (isPaymentEvent) {
      const paymentId = String(data ? data.id : (req.query.id || req.body.id || ''));
      if (paymentId) {
        const token = await resolverTokenWebhookMercadoPago(paymentId);
        await liquidarWebhookMercadoPago(paymentId, token);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Gateway Webhook Error]', error.message);
    res.status(200).send('OK');
  }
});

async function getSaaSGatewayCredentials() {
  let clientId = '';
  let clientSecret = '';

  try {
    const idRow = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'mp_client_id'");
    if (idRow && idRow.valor) clientId = idRow.valor;

    const secretRow = await db.getAsync("SELECT valor FROM ConfiguracoesSaaS WHERE chave = 'mp_client_secret'");
    if (secretRow && secretRow.valor) clientSecret = secretRow.valor;
  } catch (e) {
    console.error('Erro ao ler credenciais do banco:', e);
  }

  if (!clientId) clientId = process.env.MERCADO_PAGO_CLIENT_ID || '';
  if (!clientSecret) clientSecret = process.env.MERCADO_PAGO_CLIENT_SECRET || '';

  return { clientId, clientSecret };
}

// OAuth: Gerar URL de Autorização para a Arena conectar a conta Mercado Pago
router.get('/oauth/url', verifyToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { clientId } = await getSaaSGatewayCredentials();
    const host = req.headers.host || 'localhost:3000';
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const defaultRedirect = `${protocol}://${host}/api/pagamentos/gateway/oauth/callback`;
    const redirectUri = process.env.MERCADO_PAGO_REDIRECT_URI || defaultRedirect;

    if (!clientId || clientId.trim() === '') {
      return res.status(400).json({ 
        error: 'Para usar a conexão em 1 clique, insira o seu MERCADO_PAGO_CLIENT_ID nas configurações da plataforma.' 
      });
    }

    const authUrl = `https://auth.mercadopago.com.br/authorization?client_id=${clientId.trim()}&response_type=code&platform_id=mp&redirect_uri=${encodeURIComponent(redirectUri)}&state=${tenantId}`;

    res.json({ url: authUrl });
  } catch (error) {
    console.error('[OAuth URL Error]', error);
    res.status(500).json({ error: 'Erro ao gerar URL de autorização OAuth.' });
  }
});

// OAuth: Callback que recebe o código e troca pelo Access Token da Arena
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error || !code) {
      return res.status(400).send('<h2>Autorização cancelada ou recusada pelo Mercado Pago.</h2><script>setTimeout(() => window.close(), 3000);</script>');
    }

    const tenantId = state;
    const { clientId, clientSecret } = await getSaaSGatewayCredentials();
    const host = req.headers.host || 'localhost:3000';
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const defaultRedirect = `${protocol}://${host}/api/pagamentos/gateway/oauth/callback`;
    const redirectUri = process.env.MERCADO_PAGO_REDIRECT_URI || defaultRedirect;

    if (clientId && clientSecret) {
      const mpRes = await fetch('https://api.mercadopago.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri
        })
      });

      if (mpRes.ok) {
        const mpData = await mpRes.json();
        const accessToken = mpData.access_token;
        const publicKey = mpData.public_key || '';

        if (tenantId && accessToken) {
          await db.runAsync(`
            UPDATE Arenas
            SET gateway_access_token = ?, gateway_public_key = ?
            WHERE id = ?
          `, [accessToken, publicKey, tenantId]);
        }
      } else {
        const errData = await mpRes.json();
        const safeErrMsg = String(errData?.message || 'Erro na resposta do Mercado Pago').replace(/[\r\n]/g, '');
        console.error(`[OAuth Token Exchange Error] ${safeErrMsg}`);
      }
    }

    return res.redirect('http://localhost:5173/admin/configuracoes?tab=pagamentos&oauth=success');
  } catch (error) {
    console.error('[OAuth Callback Error]', error);
    res.status(500).send('<h2>Erro interno no processo de autenticação.</h2>');
  }
});

// OAuth: Trocar o código de autorização pelo Access Token da Arena
router.post('/oauth/exchange', async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code || !state) {
      return res.status(400).json({ error: 'Parâmetros code e state são obrigatórios.' });
    }

    const tenantId = state;
    const { clientId, clientSecret } = await getSaaSGatewayCredentials();
    const host = req.headers.host || 'localhost:3000';
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const defaultRedirect = `${protocol}://${host}/api/pagamentos/gateway/oauth/callback`;
    const redirectUri = process.env.MERCADO_PAGO_REDIRECT_URI || defaultRedirect;

    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'Credenciais da plataforma não configuradas no backend.' });
    }

    const mpRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });

    if (mpRes.ok) {
      const mpData = await mpRes.json();
      const accessToken = mpData.access_token;
      const publicKey = mpData.public_key || '';

      if (tenantId && accessToken) {
        await db.runAsync(`
          UPDATE Arenas
          SET gateway_access_token = ?, gateway_public_key = ?
          WHERE id = ?
        `, [accessToken, publicKey, tenantId]);

        return res.json({ message: 'Conta Mercado Pago conectada com sucesso!', accessToken, publicKey });
      }
    } else {
      const errData = await mpRes.json();
      const safeErrMsg = String(errData?.message || 'Erro ao trocar código de autorização.').replace(/[\r\n]/g, '');
      console.error(`[OAuth Exchange Error] ${safeErrMsg}`);
      return res.status(400).json({ error: safeErrMsg });
    }
  } catch (error) {
    console.error('[OAuth Exchange Error]', error);
    res.status(500).json({ error: 'Erro interno ao processar OAuth.' });
  }
});

// OAuth: Desconectar a conta Mercado Pago da Arena
router.post('/oauth/desconectar', verifyToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    await db.runAsync(`
      UPDATE Arenas
      SET gateway_access_token = NULL, gateway_public_key = NULL
      WHERE id = ?
    `, [tenantId]);
    res.json({ message: 'Conta Mercado Pago desconectada com sucesso.' });
  } catch (error) {
    console.error('[OAuth Desconectar Error]', error);
    res.status(500).json({ error: 'Erro ao desconectar conta.' });
  }
});

module.exports = router;
