import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calendar, Wallet, Users, BarChart3, ShieldCheck, Settings, CreditCard, LogOut, ChevronRight, type LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
}

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

export function AdminSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();

  const userStr = localStorage.getItem('courtmanager_user');
  const user = userStr ? JSON.parse(userStr) : null;
  const userName = user?.nome || 'Gestor Arena';
  const userRole = user?.perfil || 'Administrador';
  const arenaName = localStorage.getItem('arena_nome') || 'Arena Principal';

  const handleLogout = () => {
    localStorage.removeItem('courtmanager_token');
    localStorage.removeItem('courtmanager_user');
    localStorage.removeItem('arena_nome');
    window.location.href = '/login';
  };

  return (
    <aside className={`${collapsed ? 'w-[68px]' : 'w-[228px]'} shrink-0 h-screen sticky top-0 bg-charcoal text-off-white flex flex-col transition-[width] duration-200 ease-out z-20`}>
      {/* Brand */}
      <div
        className="px-4 h-16 flex items-center gap-2.5 border-b border-white/10 cursor-pointer text-left"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        title="Toggle Menu"
      >
        <div className="w-9 h-9 rounded-lg bg-off-white text-charcoal flex items-center justify-center font-bold text-sm shrink-0">
          CM
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">CourtManager</div>
            <div className="text-[11px] text-off-white/60 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success pulse-dot" />
              Painel Gestor
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          // Filtragem de permissões por perfil
          if (item.id === 'relatorios' && userRole !== 'Administrador' && userRole !== 'Gerente') return null;
          if (item.id === 'assinatura' && userRole !== 'Administrador' && userRole !== 'Gerente') return null;
          if (item.id === 'auditoria' && userRole !== 'Administrador') return null;
          if (item.id === 'configuracoes' && userRole !== 'Administrador' && userRole !== 'Gerente') return null;

          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.id}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors group ${isActive ? 'bg-white/10 text-off-white font-medium' : 'text-off-white/65 hover:text-off-white hover:bg-white/5'
                }`}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && isActive && <ChevronRight size={14} className="ml-auto opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-white/10">
        <div className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-success text-off-white flex items-center justify-center text-xs font-semibold shrink-0">
            {userName.substring(0, 2).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{userName}</div>
              <button onClick={handleLogout} className="text-[11px] text-off-white/50 flex items-center gap-1 hover:text-white transition-colors cursor-pointer bg-transparent border-none p-0">
                <LogOut size={11} /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
