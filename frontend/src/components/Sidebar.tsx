import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, FileText, Wallet, Users, Megaphone, ShieldCheck, Settings, LogOut, ChevronRight, type LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
}

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

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('courtmanager_token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (err) {
      console.error('Erro no logout do backend:', err);
    }
    localStorage.removeItem('courtmanager_token');
    localStorage.removeItem('courtmanager_user');
    navigate('/master-login');
  };

  return (
    <aside className={`${collapsed ? 'w-[68px]' : 'w-[248px]'} shrink-0 h-screen sticky top-0 bg-charcoal text-off-white flex flex-col transition-[width] duration-200 ease-out z-20`}>
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
            <div className="text-sm font-semibold leading-tight">CourtManager</div>
            <div className="text-[11px] text-off-white/60 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-warning pulse-dot" />
              Painel Master
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          const isHiddenInMenu = item.id === 'arena-detalhe';
          if (isHiddenInMenu) return null;
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

      {/* Footer / master identity */}
      <div className="px-2 py-3 border-t border-white/10">
        <div className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-warning text-charcoal flex items-center justify-center text-xs font-semibold shrink-0">
            MS
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">master@courtmanager</div>
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
