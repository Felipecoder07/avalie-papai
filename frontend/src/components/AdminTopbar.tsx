import { useState, useEffect } from 'react';
import { Menu, Bell, ChevronRight, X, Globe, Copy, ExternalLink, Share2, Check } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { NAV_ITEMS } from './AdminSidebar';
import { safeStorage } from '../utils/safeStorage';

interface AdminTopbarProps {
  onToggleSidebar: () => void;
}

export function AdminTopbar({ onToggleSidebar }: Readonly<AdminTopbarProps>) {
  const location = useLocation();
  const item = NAV_ITEMS.find((n) => n.path === location.pathname);

  const [arenaName, setArenaName] = useState(() => safeStorage.getItem('arena_nome') || 'Arena Principal');
  const [arenaSlug, setArenaSlug] = useState(() => safeStorage.getItem('arena_slug') || 'felp-arena');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPortalMenu, setShowPortalMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleChanged = () => {
      setArenaName(safeStorage.getItem('arena_nome') || 'Arena Principal');
      setArenaSlug(safeStorage.getItem('arena_slug') || 'felp-arena');
    };
    window.addEventListener('arena_nome_changed', handleChanged);

    // Busca dados atualizados da arena logada para sincronizar nome e slug reais
    const token = safeStorage.getItem('courtmanager_token');
    if (token) {
      fetch('/api/arenas/minha', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => {
          if (data && data.slug) {
            setArenaSlug(data.slug);
            safeStorage.setItem('arena_slug', data.slug);
          }
          if (data && data.nome) {
            setArenaName(data.nome);
            safeStorage.setItem('arena_nome', data.nome);
          }
        })
        .catch(() => {});
    }

    return () => window.removeEventListener('arena_nome_changed', handleChanged);
  }, []);

  const fetchNotifications = async () => {
    const token = safeStorage.getItem('courtmanager_token');
    if (!token) return;
    try {
      const res = await fetch('/api/auth/comunicados/ativos', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error('Erro ao buscar notificações na Topbar:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const isLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('10.') ||
    window.location.hostname.startsWith('172.') ||
    window.location.port === '5173' ||
    window.location.port === '5176'
  );

  const clientPortalUrl = isLocal
    ? `${window.location.protocol}//${window.location.hostname}:5176/arena/${arenaSlug}`
    : `${window.location.protocol}//${window.location.hostname}/arena/${arenaSlug}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(clientPortalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpen = () => {
    window.open(clientPortalUrl, '_blank');
  };

  const handleWhatsApp = () => {
    const ball = String.fromCodePoint(0x1F3D0); // 🏐
    const hand = String.fromCodePoint(0x1F449); // 👉
    const messageText = `${ball} Agende sua quadra na ${arenaName} de forma rápida e online. Escolha o melhor horário e reserve agora:\n\n${hand} ${clientPortalUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(messageText)}`, '_blank');
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-cream/85 backdrop-blur-md border-b border-border-passive flex items-center gap-3 px-4 md:px-6">
      <button onClick={onToggleSidebar} className="p-2 -ml-2 rounded-lg text-muted hover:text-charcoal hover:bg-cream-surface transition-colors" aria-label="Recolher menu">
        <Menu size={18} />
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm min-w-0">
        <span className="text-muted hidden sm:inline">Painel Gestor</span>
        <ChevronRight size={13} className="text-muted/50 hidden sm:inline" />
        <span className="font-medium text-charcoal truncate">{item?.label || 'Dashboard'}</span>
      </div>

      <div className="flex-1" />

      {/* Botão de Divulgação do Portal do Cliente */}
      <div className="relative">
        <button
          onClick={() => setShowPortalMenu(!showPortalMenu)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition-colors active:scale-95"
        >
          <Globe size={14} className="text-emerald-600" />
          <span className="hidden sm:inline">Portal do Cliente</span>
        </button>

        {showPortalMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              role="presentation"
              onClick={() => setShowPortalMenu(false)}
              onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setShowPortalMenu(false); }}
            />
            <div className="absolute right-0 mt-2 w-80 bg-off-white border border-border-passive rounded-xl shadow-lg p-4 z-50 animate-scale-in">
              <div className="flex items-center justify-between border-b border-border-passive pb-2 mb-3">
                <span className="text-xs font-bold text-charcoal flex items-center gap-1.5">
                  <Globe size={14} className="text-emerald-600" />
                  Link da Sua Arena
                </span>
                <button onClick={() => setShowPortalMenu(false)} className="text-muted hover:text-charcoal p-1">
                  <X size={14} />
                </button>
              </div>

              <p className="text-[11px] text-muted mb-2 leading-relaxed">
                Divulgue este link no Instagram, WhatsApp e redes da arena para seus clientes agendarem online:
              </p>

              <div className="flex items-center gap-1.5 bg-cream px-2.5 py-2 rounded-lg border border-border-passive mb-3">
                <input
                  type="text"
                  readOnly
                  value={clientPortalUrl}
                  className="flex-1 bg-transparent text-xs text-charcoal font-mono outline-none truncate select-all"
                />
                <button
                  onClick={handleCopy}
                  className="px-2 py-1 rounded bg-off-white hover:bg-cream-surface border border-border-passive text-charcoal text-[11px] font-bold flex items-center gap-1 transition-colors shrink-0"
                >
                  {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleOpen}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-charcoal text-white text-xs font-semibold hover:bg-charcoal/90 transition-colors"
                >
                  <ExternalLink size={13} />
                  Abrir Portal
                </button>
                <button
                  onClick={handleWhatsApp}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <Share2 size={13} />
                  WhatsApp
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Arena Name Indicator */}
      <div className="topbar-arena hidden md:flex">
        <span className="arena-dot" />
        {arenaName}
      </div>

      {/* Central de Notificações com Dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className={`relative p-2 rounded-lg text-muted hover:text-charcoal hover:bg-cream-surface transition-colors ${showDropdown ? 'bg-cream-surface text-charcoal font-medium' : ''}`}
          aria-label="Notificações"
        >
          <Bell size={18} />
          {notifications.length > 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
          )}
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              role="presentation"
              onClick={() => setShowDropdown(false)}
              onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setShowDropdown(false); }}
            />
            <div className="absolute right-0 mt-2 w-80 bg-off-white border border-border-passive rounded-xl shadow-lg p-4 z-50 animate-scale-in">
              <div className="flex items-center justify-between border-b border-border-passive pb-2 mb-3">
                <span className="text-xs font-bold text-charcoal flex items-center gap-1.5">
                  Notificações
                  {notifications.length > 0 && (
                    <span className="bg-danger/10 text-danger text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {notifications.length}
                    </span>
                  )}
                </span>
                {notifications.length > 0 && (
                  <button
                    onClick={() => setNotifications([])}
                    className="text-[10px] text-muted hover:text-charcoal transition-colors font-medium"
                  >
                    Limpar tudo
                  </button>
                )}
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted">
                    Nenhuma notificação no momento.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="p-2.5 rounded-lg bg-cream/50 border border-border-passive/60 text-xs">
                      <p className="font-semibold text-charcoal mb-0.5">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
