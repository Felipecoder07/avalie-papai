import { ADMIN_NAV_ITEMS as NAV_ITEMS } from './navigation';
import { logout } from '../utils/apiFetch';
import { SidebarShell, type NavItem, type SidebarProps } from './SidebarShell';
import { clearSession, getStoredUser } from '../utils/session';
import { safeStorage } from '../utils/safeStorage';





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

  const handleLogout = async () => {
    try { await logout(); } catch { window.alert("Não foi possível encerrar a sessão. Tente novamente."); return; }
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
