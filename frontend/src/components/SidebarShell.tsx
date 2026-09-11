import type { MouseEventHandler } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, LogOut, type LucideIcon } from 'lucide-react';

export interface NavItem {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

export interface SidebarProps {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}

interface SidebarShellProps extends SidebarProps {
  readonly variant: 'admin' | 'master';
  readonly items: readonly NavItem[];
  readonly userName: string;
  readonly initials: string;
  readonly onLogout: MouseEventHandler<HTMLButtonElement>;
}

const appearance = {
  admin: { width: 'w-[228px]', dot: 'bg-success', avatar: 'bg-success text-off-white', label: 'Painel Gestor', brand: 'truncate' },
  master: { width: 'w-[248px]', dot: 'bg-warning', avatar: 'bg-warning text-charcoal', label: 'Painel Master', brand: '' }
};

export function SidebarShell({ collapsed, onToggle, variant, items, userName, initials, onLogout }: Readonly<SidebarShellProps>) {
  const location = useLocation();
  const style = appearance[variant];

  return (
    <aside className={`${collapsed ? 'w-[68px]' : style.width} shrink-0 h-screen sticky top-0 bg-charcoal text-off-white flex flex-col transition-[width] duration-200 ease-out z-20`}>
      <button
        type="button"
        className="w-full px-4 h-16 flex items-center gap-2.5 border-b border-white/10 cursor-pointer text-left"
        onClick={onToggle}
        aria-label="Alternar menu"
        aria-expanded={!collapsed}
        title="Toggle Menu"
      >
        <span className="w-9 h-9 rounded-lg bg-off-white text-charcoal flex items-center justify-center font-bold text-sm shrink-0">CM</span>
        {!collapsed && (
          <span className="min-w-0">
            <span className={`block text-sm font-semibold leading-tight ${style.brand}`}>CourtManager</span>
            <span className="text-[11px] text-off-white/60 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${style.dot} pulse-dot`} />
              {style.label}
            </span>
          </span>
        )}
      </button>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.id}
              to={item.path}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors group ${isActive ? 'bg-white/10 text-off-white font-medium' : 'text-off-white/65 hover:text-off-white hover:bg-white/5'}`}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && isActive && <ChevronRight size={14} className="ml-auto opacity-60" />}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t border-white/10">
        <div className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/5 ${collapsed ? 'justify-center' : ''}`}>
          <div className={`w-8 h-8 rounded-full ${style.avatar} flex items-center justify-center text-xs font-semibold shrink-0`}>{initials}</div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{userName}</div>
              <button type="button" onClick={onLogout} className="text-[11px] text-off-white/50 flex items-center gap-1 hover:text-white transition-colors cursor-pointer bg-transparent border-none p-0">
                <LogOut size={11} /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
