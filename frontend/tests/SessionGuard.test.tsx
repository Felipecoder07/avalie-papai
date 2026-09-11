import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RoleRoute, SessionGuard } from '../src/components/SessionGuard';
import { safeStorage } from '../src/utils/safeStorage';
import { getStoredUser } from '../src/utils/session';

function renderGuard(profile: 'SuperAdmin' | 'Cliente' = 'SuperAdmin', acceptRemoteLogin = false) {
  const loginPath = profile === 'SuperAdmin' ? '/master-login' : '/login';
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/protected" element={
          <SessionGuard requiredProfile={profile} roleLabel={profile} loginPath={loginPath} acceptRemoteLogin={acceptRemoteLogin}>
            <p>Conteúdo protegido</p>
          </SessionGuard>
        } />
        <Route path={loginPath} element={<p>Login necessário</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('server-validated sessions', () => {
  it.each(['SuperAdmin', 'Cliente'] as const)('accepts only the server-confirmed %s profile', async (perfil) => {
    safeStorage.setItem('courtmanager_token', 'abc.def-ghi');
    const usuario = { id: 1, nome: 'João', perfil };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ usuario }) });
    vi.stubGlobal('fetch', fetchMock);
    renderGuard(perfil);
    expect(await screen.findByText('Conteúdo protegido')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { headers: { Authorization: 'Bearer abc.def-ghi' } });
    expect(getStoredUser()).toEqual(usuario);
  });

  it.each(['SuperAdmin', 'Cliente'] as const)('redirects a missing %s session to its own login', async (perfil) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderGuard(perfil);
    expect(await screen.findByText('Login necessário')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { ok: false, json: async () => ({}) },
    { ok: true, json: async () => ({ usuario: { perfil: 'Cliente' } }) },
    { ok: true, json: async () => ({}) },
    { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } }
  ])('rejects expired, wrong-profile, or malformed responses', async (response) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    safeStorage.setItem('courtmanager_token', 'expired');
    safeStorage.setItem('courtmanager_user', JSON.stringify({ perfil: 'SuperAdmin' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    renderGuard();
    expect(await screen.findByText('Login necessário')).toBeInTheDocument();
    expect(getStoredUser()).toBeNull();
    expect(safeStorage.getItem('courtmanager_token')).toBeNull();
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });

  it('handles a network failure by clearing the session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    safeStorage.setItem('courtmanager_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    renderGuard();
    expect(await screen.findByText('Login necessário')).toBeInTheDocument();
    expect(safeStorage.getItem('courtmanager_token')).toBeNull();
  });

  it('ignores a response received after unmounting', async () => {
    let resolveResponse!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(resolve => { resolveResponse = resolve; })));
    safeStorage.setItem('courtmanager_token', 'token');
    const view = renderGuard();
    view.unmount();
    await act(async () => {
      resolveResponse({ ok: true, json: async () => ({ usuario: { perfil: 'SuperAdmin' } }) });
    });
    expect(getStoredUser()).toBeNull();
  });

  it('does not reuse an approved client session while switching to Master', async () => {
    let resolveMaster!: (value: unknown) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ usuario: { perfil: 'Cliente' } }) })
      .mockReturnValueOnce(new Promise(resolve => { resolveMaster = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    safeStorage.setItem('courtmanager_token', 'token');
    const view = render(
      <MemoryRouter><SessionGuard requiredProfile="Cliente" loginPath="/login" roleLabel="Cliente"><p>Portal</p></SessionGuard></MemoryRouter>
    );
    expect(await screen.findByText('Portal')).toBeInTheDocument();
    view.rerender(
      <MemoryRouter><SessionGuard requiredProfile="SuperAdmin" loginPath="/master-login" roleLabel="Master"><p>Painel Master</p></SessionGuard></MemoryRouter>
    );
    expect(screen.queryByText('Painel Master')).not.toBeInTheDocument();
    expect(screen.getByText('Verificando...')).toBeInTheDocument();
    await act(async () => {
      resolveMaster({ ok: true, json: async () => ({ usuario: { perfil: 'SuperAdmin' } }) });
    });
    expect(await screen.findByText('Painel Master')).toBeInTheDocument();
  });

  it('checks remote login credentials with the server before granting access', async () => {
    const params = new URLSearchParams({ token: 'remote-token', user: btoa(JSON.stringify({ perfil: 'SuperAdmin' })) });
    window.history.replaceState({}, '', `/master/dashboard?${params}`);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    renderGuard('SuperAdmin', true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { headers: { Authorization: 'Bearer remote-token' } }));
    expect(await screen.findByText('Login necessário')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });
});

describe('administrative route permissions', () => {
  it.each([
    ['Administrador', true], ['Gerente', true], ['Recepcionista', false], ['Colaborador', false], ['Cliente', false]
  ])('checks the stored %s profile without changing the permission rules', async (perfil, permitted) => {
    safeStorage.setItem('courtmanager_user', JSON.stringify({ perfil }));
    render(
      <MemoryRouter initialEntries={['/admin/relatorios']}>
        <Routes>
          <Route path="/admin/relatorios" element={<RoleRoute allowedRoles={['Administrador', 'Gerente']}><p>Relatórios protegidos</p></RoleRoute>} />
          <Route path="/admin/dashboard" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(permitted ? 'Relatórios protegidos' : 'Dashboard')).toBeInTheDocument();
  });

  it('redirects malformed user data instead of throwing or allowing access', async () => {
    localStorage.setItem('courtmanager_user', '%broken');
    render(<MemoryRouter><RoleRoute allowedRoles={['Administrador']}><p>Restrito</p></RoleRoute></MemoryRouter>);
    expect(screen.queryByText('Restrito')).not.toBeInTheDocument();
  });
});
