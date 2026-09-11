import { LayoutDashboard, Building2, FileText, Wallet, Users, Megaphone, ShieldCheck, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SidebarShell, type NavItem, type SidebarProps } from './SidebarShell';
import { clearSession } from '../utils/session';
import { safeStorage } from '../utils/safeStorage';

export type { NavItem } from './SidebarShell';

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', path: '/master/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'arenas', path: '/master/arenas', label: 'Arenas', icon: Building2 },
  { id: 'arena-detalhe', path: '/master/arena-detalhe', label: 'Detalhe da arena', icon: FileText },
  { id: 'financeiro', path: '/master/financeiro', label: 'Financeiro', icon: Wallet },
  { id: 'usuarios', path: '/master/usuarios', label: 'Usuários', icon: Users },
  { id: 'comunicacao', path: '/master/comunicacao', label: 'Comunicação', icon: Megaphone },
  { id: 'auditoria', path: '/master/auditoria', label: 'Auditoria', icon: ShieldCheck },
  { id: 'configuracoes', path: '/master/configuracoes', label: 'Configurações', icon: Settings },
];

export function Sidebar({ collapsed, onToggle }: Readonly<SidebarProps>) {
  const navigate = useNavigate();

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const token = safeStorage.getItem('courtmanager_token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    } catch (err) {
      console.error('Erro no logout do backend:', err);
    }
    clearSession();
    navigate('/master-login');
  };

  return (
    <SidebarShell
      variant="master"
      collapsed={collapsed}
      onToggle={onToggle}
      items={NAV_ITEMS.filter(item => item.id !== 'arena-detalhe')}
      userName="master@courtmanager"
      initials="MS"
      onLogout={handleLogout}
    />
  );
}
