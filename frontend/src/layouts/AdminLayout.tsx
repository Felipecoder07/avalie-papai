import { apiFetch as fetch } from '../utils/apiFetch';
import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminTopbar } from '../components/AdminTopbar';
import { AdminSidebar } from '../components/AdminSidebar';
import { Megaphone, X, Wrench } from 'lucide-react';

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<{ active: boolean; message: string } | null>(null);

  useEffect(() => {
    // 1. Verifica estado de manutenção global
    fetch('/api/auth/manutencao')
      .then(r => r.json())
      .then(data => {
        if (data && data.ativa) {
          setMaintenance({ active: true, message: data.mensagem });
        }
      })
      .catch(console.error);

    // 2. Busca comunicados e alertas da arena logada
    const token = localStorage.getItem('courtmanager_token');
    if (!token) return;

    fetch('/api/auth/comunicados/ativos', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          // Exibe apenas comunicados do tipo 'alerta' (internos no sistema)
          setAlerts(data.filter(a => a.channel === 'alerta'));
        }
      })
      .catch(console.error);
  }, []);

  const handleDismissAlert = (id: any) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  // Se o sistema estiver em manutenção, renderiza a tela bloqueada de manutenção
  if (maintenance && maintenance.active) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-[#fdfcf9] to-[#eae7e0] p-6 text-center select-none">
        <div className="max-w-md w-full p-8 bg-off-white border border-border-passive rounded-2xl shadow-lg animate-scale-in">
          <div className="w-16 h-16 rounded-2xl bg-warning-soft text-warning flex items-center justify-center mx-auto mb-6 border border-warning/10">
            <Wrench size={32} />
          </div>
          <h1 className="text-xl font-bold text-charcoal mb-2">Sistema em Manutenção</h1>
          <p className="text-sm text-muted mb-6 leading-relaxed">
            {maintenance.message}
          </p>
          <div className="border-t border-border-passive pt-5 text-xs text-muted">
            Por favor, tente novamente mais tarde. Se precisar de assistência imediata, entre em contato com o suporte.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-cream overflow-hidden font-sans">
      <AdminSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminTopbar onToggleSidebar={() => setCollapsed(!collapsed)} />
        {alerts.map((alert) => (
          <div key={alert.id} className="bg-warning-soft border-b border-warning/20 px-4 py-2 flex items-center justify-between gap-3 text-warning-dark select-none animate-fade-in">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Megaphone size={15} className="shrink-0 text-warning" />
              <span>{alert.message}</span>
            </div>
            <button onClick={() => handleDismissAlert(alert.id)} className="p-1 rounded-md hover:bg-warning/10 text-warning-dark/70 hover:text-warning-dark transition-colors">
              <X size={14} />
            </button>
          </div>
        ))}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
