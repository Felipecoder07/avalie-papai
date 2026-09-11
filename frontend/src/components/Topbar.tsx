import { Menu, Search, Bell, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from './Sidebar';

interface TopbarProps {
  onToggleSidebar: () => void;
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
}

export function Topbar({ onToggleSidebar, search, onSearchChange, searchPlaceholder }: Readonly<TopbarProps>) {
  const location = useLocation();
  const item = NAV_ITEMS.find((n) => n.path === location.pathname);

  return (
    <header className="sticky top-0 z-30 h-16 bg-cream/85 backdrop-blur-md border-b border-border-passive flex items-center gap-3 px-4 md:px-6">
      <button onClick={onToggleSidebar} className="p-2 -ml-2 rounded-lg text-muted hover:text-charcoal hover:bg-cream-surface transition-colors" aria-label="Recolher menu">
        <Menu size={18} />
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm min-w-0">
        <span className="text-muted hidden sm:inline">Painel Master</span>
        <ChevronRight size={13} className="text-muted/50 hidden sm:inline" />
        <span className="font-medium text-charcoal truncate">{item?.label || 'Detalhe da arena'}</span>
      </div>

      <div className="flex-1" />

      {/* Search (optional) */}
      {onSearchChange && (
        <div className="relative hidden md:block">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/60" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder || 'Buscar...'}
            className="w-64 lg:w-80 pl-9 pr-3 py-2 text-sm bg-off-white border border-border-passive rounded-lg placeholder:text-muted/50 focus:border-charcoal focus:outline-none transition-colors"
          />
        </div>
      )}

      <button className="relative p-2 rounded-lg text-muted hover:text-charcoal hover:bg-cream-surface transition-colors" aria-label="Notificações">
        <Bell size={18} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-danger" />
      </button>

      {/* Quick switch */}
      <Link
        to="/master/dashboard"
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-passive bg-off-white text-xs font-medium text-charcoal hover:bg-cream-surface transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-warning pulse-dot" />
        Contexto: Master
      </Link>
    </header>
  );
}
