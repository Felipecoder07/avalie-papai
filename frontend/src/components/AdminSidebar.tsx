import { LayoutDashboard, Calendar, Wallet, Users, BarChart3, ShieldCheck, Settings, CreditCard } from 'lucide-react';
import { SidebarShell, type NavItem, type SidebarProps } from './SidebarShell';
import { clearSession, getStoredUser } from '../utils/session';
import { safeStorage } from '../utils/safeStorage';

export type { NavItem } from './SidebarShell';

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'reservas', path: '/admin/reservas', label: 'Reservas', icon: Calendar },
  { id: 'pagamentos', path: '/admin/pagamentos', label: 'Pagamentos', icon: Wallet },
  { id: 'clientes', path: '/admin/clientes', label: 'Clientes', icon: Users },
  { id: 'relatorios', path: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
  { id: 'assinatura', path: '/admin/assinatura', label: 'Assinatura', icon: CreditCard },
  { id: 'auditoria', path: '/admin/auditoria', label: 'Auditoria', icon: ShieldCheck },
  { id: 'configuracoes', path: '/admin/configuracoes', label: 'Configurações', icon: Settings },
];

const managerItems = new Set(['relatorios', 'assinatura', 'configuracoes']);

function canViewItem(item: NavItem, userRole: string): boolean {
  if (item.id === 'auditoria') return userRole === 'Administrador';
  if (managerItems.has(item.id)) return userRole === 'Administrador' || userRole === 'Gerente';
  return true;
}

export function AdminSidebar({ collapsed, onToggle }: Readonly<SidebarProps>) {
  const user = getStoredUser();
  const userName = user?.nome || 'Gestor Arena';
  const userRole = user?.perfil || '';

  const handleLogout = () => {
    clearSession();
    safeStorage.removeItem('arena_nome');
    window.location.href = '/login';
  };

  return (
    <SidebarShell
      variant="admin"
      collapsed={collapsed}
      onToggle={onToggle}
      items={NAV_ITEMS.filter(item => canViewItem(item, userRole))}
      userName={userName}
      initials={userName.substring(0, 2).toUpperCase()}
      onLogout={handleLogout}
    />
  );
}
