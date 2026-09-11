import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PortalCliente } from '../src/screens/public/PortalCliente';
import { AdminTopbar } from '../src/components/AdminTopbar';
import { safeStorage } from '../src/utils/safeStorage';

describe('session consumers', () => {
  it.each(['encoded', 'legacy'])('shows the client portal with a %s session', async (format) => {
    const user = JSON.stringify({ id: 1, nome: 'João Silva', perfil: 'Cliente' });
    if (format === 'encoded') safeStorage.setItem('courtmanager_user', user);
    else localStorage.setItem('courtmanager_user', user);
    safeStorage.setItem('courtmanager_token', 'client-token');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><PortalCliente /></MemoryRouter>);
    expect(await screen.findByText('João Silva')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/reservas/minhas', { headers: { Authorization: 'Bearer client-token' } });
  });

  it('redirects a corrupted client session to login without rendering errors', async () => {
    localStorage.setItem('courtmanager_user', '%broken');
    safeStorage.setItem('courtmanager_token', 'client-token');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={['/portal']}>
        <Routes>
          <Route path="/portal" element={<PortalCliente />} />
          <Route path="/login" element={<p>Login necessário</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Login necessário')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['encoded', 'legacy'])('displays the readable arena name from %s storage', (format) => {
    if (format === 'encoded') safeStorage.setItem('arena_nome', 'Arena São João');
    else localStorage.setItem('arena_nome', 'Arena São João');
    render(<MemoryRouter><AdminTopbar onToggleSidebar={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('Arena São João')).toBeInTheDocument();

  });
});
