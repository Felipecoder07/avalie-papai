import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminConfiguracoes } from '../src/screens/admin/AdminConfiguracoes';

describe('configuração de pagamentos sem exposição de credenciais', () => {
  let connected: boolean;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.setItem('courtmanager_token', 'session-token');
    sessionStorage.setItem('cm_config_tab', 'pagamentos');
    connected = true;
    fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      let data: unknown = {};
      if (url === '/api/arenas/minha') data = { nome: 'Arena Teste', chave_pix: 'pix@example.test' };
      if (['/api/quadras', '/api/usuarios', '/api/motivos'].includes(url)) data = [];
      if (url === '/api/pagamentos/gateway/maquineta') {
        if (options?.method === 'POST' && JSON.parse(String(options.body)).gateway_access_token) connected = true;
        data = { gateway_connected: connected, gateway_device_id: 'device_test_123', gateway_public_key: 'PUBLIC-TEST' };
      }
      if (url === '/api/pagamentos/gateway/oauth/desconectar') connected = false;
      if (url === '/api/pagamentos/gateway/oauth/exchange') {
        connected = true;
        data = { gateway_connected: true, publicKey: 'PUBLIC-TEST' };
      }
      return { ok: true, json: async () => data };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  function show() {
    return render(<MemoryRouter><AdminConfiguracoes /></MemoryRouter>);
  }

  async function loaded() {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar Configurações de Pagamento' })).toBeEnabled());
  }

  function gatewayWrites() {
    return fetchMock.mock.calls.filter(([url, options]) => url === '/api/pagamentos/gateway/maquineta' && options?.method === 'POST');
  }

  it('mostra conexão existente sem preencher a senha e preserva a chave ao salvar', async () => {
    show();
    await loaded();
    expect(screen.getByText('✓ Conta Conectada')).toBeInTheDocument();
    expect(screen.getByLabelText('Chave de API / Access Token da Arena (Mercado Pago / PagBank)')).toHaveValue('');
    expect(screen.getByDisplayValue('device_test_123')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Configurações de Pagamento' }));
    await waitFor(() => expect(gatewayWrites()).toHaveLength(1));
    const body = JSON.parse(String(gatewayWrites()[0][1]?.body));
    expect(body).toEqual({ gateway_device_id: 'device_test_123', gateway_public_key: 'PUBLIC-TEST' });
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/gateway/pos')).toBe(false);
    await loaded();
  });

  it('envia uma nova chave somente quando preenchida e limpa o campo após salvar', async () => {
    show();
    await loaded();
    const input = screen.getByLabelText('Chave de API / Access Token da Arena (Mercado Pago / PagBank)');
    fireEvent.change(input, { target: { value: ' NEW-TEST-SECRET ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Configurações de Pagamento' }));
    await waitFor(() => expect(gatewayWrites()).toHaveLength(1));
    expect(JSON.parse(String(gatewayWrites()[0][1]?.body)).gateway_access_token).toBe('NEW-TEST-SECRET');
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('desconecta pela ação explícita e atualiza a indicação da conta', async () => {
    show();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: '❌ Desconectar Conta' }));
    await waitFor(() => expect(screen.queryByText('✓ Conta Conectada')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/pagamentos/gateway/oauth/desconectar', expect.objectContaining({
      method: 'POST', headers: { Authorization: 'Bearer session-token' }
    }));
    expect(gatewayWrites()).toHaveLength(0);
  });

  it('não sobrescreve configuração que falhou ao carregar', async () => {
    const normalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/pagamentos/gateway/maquineta') throw new Error('Offline');
      return normalFetch(url, options);
    });
    show();
    await screen.findByText('Não foi possível carregar a configuração de pagamentos. Recarregue a página antes de editar.');
    expect(screen.getByRole('button', { name: 'Salvar Configurações de Pagamento' })).toBeDisabled();
    // Outras preferências da arena ainda podem ser salvas sem apagar a conexão.
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Notificações' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => url === '/api/arenas/minha' && options?.method === 'PUT')).toBe(true));
    expect(gatewayWrites()).toHaveLength(0);
  });

  it('conclui OAuth com sessão autenticada sem receber a chave privada', async () => {
    window.history.replaceState({}, '', '/admin/configuracoes?code=fake-code&state=97001');
    show();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/pagamentos/gateway/oauth/exchange', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session-token' },
      body: JSON.stringify({ code: 'fake-code', state: '97001' })
    }));
    await loaded();
    expect(screen.getByLabelText('Chave de API / Access Token da Arena (Mercado Pago / PagBank)')).toHaveValue('');
    expect(screen.getByText('✓ Conta Conectada')).toBeInTheDocument();
  });
});
