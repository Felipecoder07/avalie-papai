import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminSidebar } from '../src/components/AdminSidebar';
import { Sidebar } from '../src/components/Sidebar';
import { safeStorage } from '../src/utils/safeStorage';

describe('administrative navigation', () => {
  it.each([
    ['Administrador', true, true],
    ['Gerente', true, false],
    ['Recepcionista', false, false],
    ['Colaborador', false, false]
  ] as const)('preserves menu permissions for %s', (perfil, managerAccess, auditAccess) => {
    safeStorage.setItem('courtmanager_user', JSON.stringify({ nome: 'João Silva', perfil }));
    render(<MemoryRouter initialEntries={['/admin/reservas']}><AdminSidebar collapsed={false} onToggle={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reservas' })).toHaveAttribute('href', '/admin/reservas');
    expect(screen.getByRole('link', { name: 'Reservas' })).toHaveAttribute('aria-current', 'page');
    for (const label of ['Relatórios', 'Assinatura', 'Configurações']) {
      expect(screen.queryByRole('link', { name: label }) !== null).toBe(managerAccess);
    }
    expect(screen.queryByRole('link', { name: 'Auditoria' }) !== null).toBe(auditAccess);
  });

  it('renders a legacy session and its initials', () => {
    localStorage.setItem('courtmanager_user', JSON.stringify({ nome: 'Maria', perfil: 'Gerente' }));
    render(<MemoryRouter><AdminSidebar collapsed={false} onToggle={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getByText('MA')).toBeInTheDocument();
  });

  it('does not crash or expose restricted links for corrupted storage', () => {
    localStorage.setItem('courtmanager_user', '%broken');
    render(<MemoryRouter><AdminSidebar collapsed={false} onToggle={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('Gestor Arena')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Auditoria' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Configurações' })).not.toBeInTheDocument();
  });

  it('toggles through click, Enter, and Space using a native button', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<MemoryRouter><AdminSidebar collapsed={false} onToggle={onToggle} /></MemoryRouter>);
    const toggle = screen.getByRole('button', { name: 'Alternar menu' });
    await user.click(toggle);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(3);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps named navigation links available when collapsed', () => {
    render(<MemoryRouter><AdminSidebar collapsed onToggle={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Alternar menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'Reservas' })).toHaveAttribute('title', 'Reservas');
    expect(screen.queryByText('Painel Gestor')).not.toBeInTheDocument();
  });
});

describe('master navigation', () => {
  it('keeps its routes and hides the arena detail entry from the menu', () => {
    render(<MemoryRouter><Sidebar collapsed={false} onToggle={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('Painel Master')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Arenas' })).toHaveAttribute('href', '/master/arenas');
    expect(screen.queryByRole('link', { name: 'Detalhe da arena' })).not.toBeInTheDocument();
    expect(screen.getByText('master@courtmanager')).toBeInTheDocument();
  });

  it.each([true, false])('clears the session and returns to login after logout (network success: %s)', async (success) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    safeStorage.setItem('courtmanager_token', 'abc.def');
    safeStorage.setItem('courtmanager_user', JSON.stringify({ perfil: 'SuperAdmin' }));
    const fetchMock = success ? vi.fn().mockResolvedValue({ ok: true }) : vi.fn().mockRejectedValue(new Error('Offline'));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/master/dashboard']}>
        <Routes>
          <Route path="/master/dashboard" element={<Sidebar collapsed={false} onToggle={vi.fn()} />} />
          <Route path="/master-login" element={<p>Login Master</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByText('Login Master')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer abc.def' } }));
    expect(safeStorage.getItem('courtmanager_token')).toBeNull();
    expect(safeStorage.getItem('courtmanager_user')).toBeNull();
  });
});
