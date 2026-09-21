import { MASTER_NAV_ITEMS as NAV_ITEMS } from './navigation';
import { logout } from '../utils/apiFetch';
import { useNavigate } from 'react-router-dom';
import { SidebarShell, type SidebarProps } from './SidebarShell';
import { clearSession } from '../utils/session';





export function Sidebar({ collapsed, onToggle }: Readonly<SidebarProps>) {
  const navigate = useNavigate();

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await logout();
    } catch {
      window.alert('Não foi possível encerrar a sessão. Tente novamente.');
      return;
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
