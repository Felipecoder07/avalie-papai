import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredUser } from '../../utils/session';
import { safeStorage } from '../../utils/safeStorage';

interface Reserva {
  id: number;
  data_reserva: string;
  hora_inicio: string;
  hora_fim: string;
  status: string;
  valor_total: number;
  status_pagamento: string;
  quadra_nome: string;
}

export function PortalCliente() {
  const navigate = useNavigate();
  const token = safeStorage.getItem('courtmanager_token');
  const user = getStoredUser();

  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal de pagamento online
  const [pagandoReserva, setPagandoReserva] = useState<Reserva | null>(null);
  const [gatewayRef, setGatewayRef] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [copiaCola, setCopiaCola] = useState('');
  const [loadingGateway, setLoadingGateway] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchDashboard = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch('/api/reservas/minhas', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Falha ao obter reservas.');
      const data = await response.json();
      setReservas(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar painel.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !user) {
      navigate('/login');
      return;
    }
    fetchDashboard();
  }, [token]);

  // Polling para verificar se o pagamento foi confirmado
  useEffect(() => {
    if (!pagandoReserva) return;

    let intervalId: any;
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/pagamentos/gateway/status/${pagandoReserva.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status_pagamento === 'Pago') {
            showToast('Pagamento confirmado com sucesso!', 'success');
            setPagandoReserva(null);
            setGatewayRef('');
            setQrCode('');
            setCopiaCola('');
            fetchDashboard();
          }
        }
      } catch (err) {
        console.warn('Erro ao consultar status:', err);
      }
    };

    intervalId = setInterval(checkStatus, 3000);
    return () => clearInterval(intervalId);
  }, [pagandoReserva]);

  const handleLogout = () => {
    localStorage.removeItem('courtmanager_token');
    localStorage.removeItem('courtmanager_user');
    navigate('/login');
  };

  // Gerar cobrança Pix
  const iniciarPagamento = async (reserva: Reserva) => {
    setPagandoReserva(reserva);
    setLoadingGateway(true);
    try {
      const res = await fetch('/api/pagamentos/gateway/cobranca', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reserva_id: reserva.id,
          metodo: 'Pix'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar cobrança.');

      setGatewayRef(data.gateway_ref);
      setQrCode(data.qr_code);
      setCopiaCola(data.copia_cola);
    } catch (err: any) {
      showToast(err.message, 'error');
      setPagandoReserva(null);
    } finally {
      setLoadingGateway(false);
    }
  };

  // Simular pagamento (Helper de dev)
  const simularPagamento = async () => {
    if (!gatewayRef) return;
    try {
      const res = await fetch('/api/pagamentos/gateway/simular-pagamento', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ gateway_ref: gatewayRef })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao simular.');

      showToast('Pagamento simulado enviado ao servidor!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const formatData = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  // KPIs
  const totalReservas = reservas.length;
  const faturasPendentes = reservas.filter(r => r.status_pagamento !== 'Pago' && r.status !== 'Cancelada').length;
  const totalPendenteValor = reservas.filter(r => r.status_pagamento !== 'Pago' && r.status !== 'Cancelada').reduce((acc, curr) => acc + curr.valor_total, 0);

  return (
    <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-charcoal/10 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-forest text-white flex items-center justify-center font-bold text-lg shadow-inner">
            CM
          </div>
          <div>
            <h1 className="font-semibold text-lg tracking-tight leading-tight">CourtManager</h1>
            <span className="text-xs text-charcoal/50">Portal do Jogador</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-forest/10 text-forest flex items-center justify-center font-bold text-sm">
              {user?.nome?.substring(0, 2).toUpperCase() || 'CL'}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-sm font-medium">{user?.nome || 'Jogador'}</span>
              <span className="text-xs text-charcoal/50">Minha Conta</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-charcoal/20 hover:bg-charcoal/5 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6">
        {/* Banner de boas-vindas */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-forest">Olá, {user?.nome?.split(' ')[0]}!</h2>
            <p className="text-charcoal/60 text-sm">Acompanhe suas reservas e pagamentos em tempo real.</p>
          </div>
          <button
            onClick={() => navigate('/portal/novo-agendamento')}
            className="bg-forest hover:bg-forest-dark text-white font-semibold px-5 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 self-start sm:self-auto"
          >
            <span>+ Nova Reserva</span>
          </button>
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-5 rounded-xl border border-charcoal/10 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-semibold text-charcoal/50 uppercase tracking-wider">Total de Reservas</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-forest">{totalReservas}</span>
              <span className="text-xs text-charcoal/60">agendadas</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-charcoal/10 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-semibold text-charcoal/50 uppercase tracking-wider">Faturas Pendentes</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${faturasPendentes > 0 ? 'text-amber-600' : 'text-forest'}`}>{faturasPendentes}</span>
              <span className="text-xs text-charcoal/60">aguardando pagamento</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-charcoal/10 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-semibold text-charcoal/50 uppercase tracking-wider">Total em Aberto</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${totalPendenteValor > 0 ? 'text-red-500' : 'text-forest'}`}>
                R$ {totalPendenteValor.toFixed(2).replace('.', ',')}
              </span>
              <span className="text-xs text-charcoal/60">saldo pendente</span>
            </div>
          </div>
        </section>

        {/* Grid Lists */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Minhas Reservas */}
          <div className="bg-white p-6 rounded-xl border border-charcoal/10 shadow-sm flex flex-col">
            <h3 className="font-bold text-lg text-forest mb-4 border-b border-charcoal/5 pb-2">Minhas Reservas</h3>

            {loading ? (
              <div className="py-12 text-center text-charcoal/50 text-sm">Carregando agendamentos...</div>
            ) : reservas.length === 0 ? (
              <div className="py-12 text-center text-charcoal/50 text-sm">Você ainda não agendou nenhuma quadra.</div>
            ) : (
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                {reservas.map(r => {
                  const dataResStr = formatData(r.data_reserva);
                  const isCancelada = r.status === 'Cancelada';

                  return (
                    <div key={r.id} className="flex justify-between items-center p-3 rounded-lg bg-cream/50 border border-charcoal/5 hover:border-charcoal/10 transition-colors">
                      <div className="flex flex-col text-left">
                        <span className="text-sm font-semibold text-charcoal">{r.quadra_nome}</span>
                        <span className="text-xs text-charcoal/60">{dataResStr} · {r.hora_inicio} às {r.hora_fim}</span>
                        <span className="text-[10px] text-charcoal/40 font-mono mt-0.5">Ref: #{r.id}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${isCancelada
                          ? 'bg-red-100 text-red-700'
                          : 'bg-emerald-100 text-emerald-800'
                        }`}>
                        {r.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Histórico Financeiro */}
          <div className="bg-white p-6 rounded-xl border border-charcoal/10 shadow-sm flex flex-col">
            <h3 className="font-bold text-lg text-forest mb-4 border-b border-charcoal/5 pb-2">Situação Financeira</h3>

            {loading ? (
              <div className="py-12 text-center text-charcoal/50 text-sm">Carregando pagamentos...</div>
            ) : reservas.length === 0 ? (
              <div className="py-12 text-center text-charcoal/50 text-sm">Nenhum faturamento registrado.</div>
            ) : (
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                {reservas.map(r => {
                  const dataResStr = formatData(r.data_reserva);
                  const isPago = r.status_pagamento === 'Pago';
                  const isCancelada = r.status === 'Cancelada';

                  return (
                    <div key={r.id} className="flex justify-between items-center p-3 rounded-lg bg-cream/50 border border-charcoal/5 hover:border-charcoal/10 transition-colors">
                      <div className="flex flex-col text-left">
                        <span className="text-sm font-medium text-charcoal">Reserva de {dataResStr}</span>
                        <span className="text-xs text-charcoal/60">{r.status_pagamento}</span>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`text-sm font-bold ${isPago ? 'text-charcoal' : 'text-red-500'}`}>
                          R$ {r.valor_total.toFixed(2).replace('.', ',')}
                        </span>
                        {!isPago && !isCancelada && (
                          <button
                            onClick={() => iniciarPagamento(r)}
                            className="bg-forest text-white hover:bg-forest-dark text-[11px] font-semibold px-2 py-1 rounded transition-colors"
                          >
                            Pagar Online
                          </button>
                        )}
                        {isCancelada && (
                          <span className="text-[10px] text-charcoal/40 font-semibold uppercase">Cancelada</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL DE PAGAMENTO ONLINE */}
      {pagandoReserva && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-charcoal/10 overflow-hidden animate-fade-in">
            <div className="bg-forest text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg">Pagar Reserva #{pagandoReserva.id}</h3>
              <button
                onClick={() => setPagandoReserva(null)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              {loadingGateway ? (
                <div className="py-12 text-center text-charcoal/60 text-sm">Gerando cobrança Pix...</div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="bg-cream-surface border border-charcoal/10 rounded-lg p-3 w-full text-center text-xs mb-4">
                    <strong>{pagandoReserva.quadra_nome}</strong> · {formatData(pagandoReserva.data_reserva)} às {pagandoReserva.hora_inicio}<br />
                    Total a pagar: <strong className="text-forest text-sm">R$ {pagandoReserva.valor_total.toFixed(2).replace('.', ',')}</strong>
                  </div>

                  {qrCode && (
                    <div className="flex flex-col items-center">
                      <div className="w-48 h-48 bg-white border border-charcoal/15 rounded-lg flex items-center justify-center p-2 mb-4">
                        <img src={qrCode} alt="QR Code Pix" className="w-full h-full object-contain" />
                      </div>
                      <p className="text-xs text-charcoal/60 text-center mb-4 max-w-[280px]">
                        Abra o aplicativo de pagamentos do seu banco e escaneie o código Pix acima.
                      </p>

                      <div className="w-full mb-6">
                        <label className="text-[10px] uppercase font-bold text-charcoal/50 block mb-1">Pix Copia e Cola</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={copiaCola}
                            className="bg-cream/50 text-xs border border-charcoal/20 px-3 py-2 rounded flex-1 font-mono select-all focus:outline-none"
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(copiaCola);
                              showToast('Chave Pix copiada!', 'success');
                            }}
                            className="bg-forest/15 hover:bg-forest/20 text-forest text-xs font-semibold px-3 py-2 rounded transition-colors"
                          >
                            Copiar
                          </button>
                        </div>
                      </div>

                      {/* Simulador Dev */}
                      <div className="w-full border-t border-charcoal/10 pt-4 flex flex-col gap-2">
                        <button
                          onClick={simularPagamento}
                          className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 px-4 rounded-lg text-sm shadow-md transition-colors"
                        >
                          ⚡ Simular Confirmação do Pix
                        </button>
                        <span className="text-[10px] text-charcoal/50 text-center">
                          Clique para simular o recebimento do PIX sem precisar de app real.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="bg-cream/30 px-6 py-4 flex justify-end border-t border-charcoal/5">
              <button
                onClick={() => setPagandoReserva(null)}
                className="text-xs font-bold px-4 py-2 border border-charcoal/20 rounded-lg hover:bg-charcoal/5 transition-colors"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-white font-medium shadow-lg transition-transform duration-200 ${toast.type === 'success' ? 'bg-success' : 'bg-danger'
            }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
