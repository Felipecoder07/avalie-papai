import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredUser } from '../../utils/session';
import { safeStorage } from '../../utils/safeStorage';

interface Quadra {
  id: number;
  nome: string;
  tipo: string;
  preco_base: number;
}

interface ReservaExistente {
  quadra_id: number;
  hora_inicio: string;
  hora_fim: string;
}

export function PortalNovaReserva() {
  const navigate = useNavigate();
  const token = safeStorage.getItem('courtmanager_token');
  const user = getStoredUser();

  // Wizard state
  const [step, setStep] = useState(1);
  const [selDate, setSelDate] = useState(new Date().toISOString().split('T')[0]);
  const [selTime, setSelTime] = useState('');
  const [quadrasDisponiveis, setQuadrasDisponiveis] = useState<Quadra[]>([]);
  const [loadingQuadras, setLoadingQuadras] = useState(false);

  const [selQuad, setSelQuad] = useState<Quadra | null>(null);

  // Payment states
  const [metodoOnline, setMetodoOnline] = useState<'Pix' | 'Cartão' | ''>('');
  const [criandoReserva, setCriandoReserva] = useState(false);
  const [reservaIdCriada, setReservaIdCriada] = useState<number | null>(null);

  // Pix flow
  const [gatewayRef, setGatewayRef] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [copiaCola, setCopiaCola] = useState('');

  // Card flow
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // General status
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!token || !user) {
      navigate('/login');
    }
  }, [token]);

  // Buscar quadras livres quando avança para o Step 2
  const buscarQuadrasLivres = async () => {
    setLoadingQuadras(true);
    try {
      const res = await fetch(`/api/reservas/grade?data=${selDate}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Erro ao buscar disponibilidade.');

      const indexHorarios = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
      const slotInicio = selTime;
      const [h, m] = selTime.split(':').map(Number);
      const slotFim = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      // Filtra quadras que já possuem agendamento ou bloqueio nesse slot
      const livres = data.quadras.filter((q: any) => {
        const hasReserva = data.reservas.some((r: ReservaExistente) => {
          return r.quadra_id === q.id && (
            (r.hora_inicio <= slotInicio && r.hora_fim > slotInicio) ||
            (r.hora_inicio < slotFim && r.hora_fim >= slotFim)
          );
        });

        const hasBloqueio = data.bloqueios && data.bloqueios.some((b: any) => {
          return b.quadra_id === q.id && (
            (b.hora_inicio <= slotInicio && b.hora_fim > slotInicio) ||
            (b.hora_inicio < slotFim && b.hora_fim >= slotFim)
          );
        });

        return !hasReserva && !hasBloqueio;
      });

      setQuadrasDisponiveis(livres);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoadingQuadras(false);
    }
  };

  const handleNextStep1 = () => {
    if (!selDate || !selTime) return;
    buscarQuadrasLivres();
    setStep(2);
  };

  const handleNextStep2 = () => {
    if (!selQuad) return;
    setStep(3);
  };

  // Processar pagamento e reserva
  const processarAgendamento = async () => {
    if (!selQuad || !metodoOnline) return;
    if (!user) {
      navigate('/login');
      return;
    }
    setCriandoReserva(true);

    const [h, m] = selTime.split(':').map(Number);
    const horaFim = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    try {
      // 1. Criar Reserva no Banco (Pendente)
      const resReserva = await fetch('/api/reservas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          cliente_id: user.cliente_id,
          quadra_id: selQuad.id,
          data_reserva: selDate,
          hora_inicio: selTime,
          hora_fim: horaFim
        })
      });

      const dataReserva = await resReserva.json();
      if (!resReserva.ok) throw new Error(dataReserva.error || 'Erro ao agendar.');

      const newReservaId = dataReserva.reserva_id;
      setReservaIdCriada(newReservaId);

      // 2. Chamar o Gateway de Pagamento
      const cardPayload = metodoOnline === 'Cartão' ? { token: 'mock_card_token', payment_method_id: 'visa' } : undefined;

      const resCobranca = await fetch('/api/pagamentos/gateway/cobranca', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reserva_id: newReservaId,
          metodo: metodoOnline,
          card_data: cardPayload
        })
      });

      const dataCobranca = await resCobranca.json();
      if (!resCobranca.ok) throw new Error(dataCobranca.error || 'Erro ao processar gateway.');

      if (metodoOnline === 'Pix') {
        // Exibe o QR Code Pix e aguarda o Polling
        setGatewayRef(dataCobranca.gateway_ref);
        setQrCode(dataCobranca.qr_code);
        setCopiaCola(dataCobranca.copia_cola);
      } else {
        // Cartão simula e aprova na hora
        showToast('Pagamento aprovado com sucesso!', 'success');
        setStep(4);
      }

    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setCriandoReserva(false);
    }
  };

  // Polling para o Pix
  useEffect(() => {
    if (!reservaIdCriada || metodoOnline !== 'Pix') return;

    let intervalId: any;
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/pagamentos/gateway/status/${reservaIdCriada}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status_pagamento === 'Pago') {
            showToast('Pagamento Pix confirmado!', 'success');
            setStep(4);
          }
        }
      } catch (err) {
        console.warn(err);
      }
    };

    intervalId = setInterval(checkStatus, 3000);
    return () => clearInterval(intervalId);
  }, [reservaIdCriada, metodoOnline]);

  // Simular pagamento do Pix
  const simularPagamentoPix = async () => {
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

      showToast('Pagamento Pix simulado!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const formatData = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const timeslots = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);

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
            <span className="text-xs text-charcoal/50">Nova Reserva</span>
          </div>
        </div>
        <button
          onClick={() => navigate('/portal')}
          className="text-xs font-semibold px-4 py-2 border border-charcoal/20 rounded-lg hover:bg-charcoal/5 transition-colors"
        >
          Voltar ao Portal
        </button>
      </header>

      {/* Main Wizard Grid */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-6 flex flex-col justify-center">
        {step < 4 && (
          <div className="flex justify-between items-center gap-4 mb-8">
            <div className={`flex-1 py-2.5 border-b-4 text-center font-semibold text-sm ${step === 1 ? 'border-forest text-forest' : 'border-charcoal/10 text-charcoal/40'}`}>
              1. Horário
            </div>
            <div className={`flex-1 py-2.5 border-b-4 text-center font-semibold text-sm ${step === 2 ? 'border-forest text-forest' : 'border-charcoal/10 text-charcoal/40'}`}>
              2. Quadra
            </div>
            <div className={`flex-1 py-2.5 border-b-4 text-center font-semibold text-sm ${step === 3 ? 'border-forest text-forest' : 'border-charcoal/10 text-charcoal/40'}`}>
              3. Pagamento
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-2xl border border-charcoal/10 shadow-lg text-left">

          {/* STEP 1: Seleção de data e hora */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-forest mb-4">Escolha o Dia e Horário</h2>

              <div className="mb-6 flex flex-col">
                <label className="text-xs font-bold text-charcoal/50 uppercase tracking-wider mb-2">Selecione a Data</label>
                <input
                  type="date"
                  value={selDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setSelDate(e.target.value)}
                  className="bg-cream/40 border border-charcoal/20 rounded-lg px-4 py-2.5 max-w-xs focus:outline-none focus:border-forest"
                />
              </div>

              <div className="mb-8">
                <label className="text-xs font-bold text-charcoal/50 uppercase tracking-wider block mb-3">Horários Disponíveis (Sessões de 1 hora)</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {timeslots.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelTime(t)}
                      className={`py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${selTime === t
                          ? 'bg-forest border-forest text-white shadow-md'
                          : 'bg-white border-charcoal/15 text-charcoal hover:border-forest/50'
                        }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end border-t border-charcoal/5 pt-4">
                <button
                  type="button"
                  onClick={handleNextStep1}
                  disabled={!selDate || !selTime}
                  className="bg-forest hover:bg-forest-dark disabled:opacity-40 text-white font-bold px-6 py-2.5 rounded-lg shadow transition-colors"
                >
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Seleção da Quadra */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-forest mb-2">Quadras Livres</h2>
              <p className="text-xs text-charcoal/60 mb-6">Disponíveis para {formatData(selDate)} às {selTime}</p>

              {loadingQuadras ? (
                <div className="py-16 text-center text-charcoal/50">Buscando quadras disponíveis...</div>
              ) : quadrasDisponiveis.length === 0 ? (
                <div className="py-16 text-center text-charcoal/50">
                  Nenhuma quadra livre neste horário.
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-forest underline font-bold ml-1"
                  >
                    Mudar horário
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {quadrasDisponiveis.map(q => (
                    <button
                      type="button"
                      key={q.id}
                      onClick={() => setSelQuad(q)}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all text-left w-full ${selQuad?.id === q.id
                          ? 'border-forest bg-forest/5 shadow-md'
                          : 'border-charcoal/10 hover:border-forest/45'
                        }`}
                    >
                      <h4 className="font-bold text-base text-charcoal">{q.nome}</h4>
                      <span className="text-xs text-charcoal/50 mt-1 block">{q.tipo}</span>
                      <span className="text-lg font-extrabold text-forest mt-3 block">
                        R$ {q.preco_base.toFixed(2).replace('.', ',')}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-between border-t border-charcoal/5 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-6 py-2.5 border border-charcoal/20 hover:bg-charcoal/5 font-bold rounded-lg transition-colors"
                >
                  ← Voltar
                </button>
                <button
                  type="button"
                  onClick={handleNextStep2}
                  disabled={!selQuad}
                  className="bg-forest hover:bg-forest-dark disabled:opacity-40 text-white font-bold px-6 py-2.5 rounded-lg shadow transition-colors"
                >
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Pagamento Online */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-forest mb-4">Pagamento Seguro Online</h2>

              {/* Resumo da reserva */}
              <div className="bg-cream/50 border border-charcoal/10 rounded-xl p-4 mb-6">
                <h4 className="text-xs font-bold text-charcoal/50 uppercase tracking-wider mb-3">Resumo da Reserva</h4>
                <div className="flex justify-between items-center text-sm mb-2">
                  <span className="text-charcoal/60">Data e Hora:</span>
                  <strong className="text-charcoal font-semibold">{formatData(selDate)} às {selTime}</strong>
                </div>
                <div className="flex justify-between items-center text-sm mb-3">
                  <span className="text-charcoal/60">Quadra:</span>
                  <strong className="text-charcoal font-semibold">{selQuad?.nome} ({selQuad?.tipo})</strong>
                </div>
                <div className="flex justify-between items-center border-t border-charcoal/10 pt-3 text-base">
                  <span className="font-semibold text-charcoal">Total a pagar:</span>
                  <strong className="text-forest text-lg font-extrabold">
                    R$ {selQuad?.preco_base.toFixed(2).replace('.', ',')}
                  </strong>
                </div>
              </div>

              {!qrCode && (
                <div>
                  <h4 className="text-sm font-bold text-charcoal/80 mb-3">Escolha a forma de pagamento:</h4>
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <button
                      type="button"
                      onClick={() => setMetodoOnline('Pix')}
                      className={`p-5 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${metodoOnline === 'Pix'
                          ? 'border-forest bg-forest/5'
                          : 'border-charcoal/10 hover:border-forest/40'
                        }`}
                    >
                      <span className="text-3xl">💠</span>
                      <span className="font-bold text-sm">Pix Online</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoOnline('Cartão')}
                      className={`p-5 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${metodoOnline === 'Cartão'
                          ? 'border-forest bg-forest/5'
                          : 'border-charcoal/10 hover:border-forest/40'
                        }`}
                    >
                      <span className="text-3xl">💳</span>
                      <span className="font-bold text-sm">Cartão de Crédito</span>
                    </button>
                  </div>

                  {/* Formulário do Cartão (Simulado) */}
                  {metodoOnline === 'Cartão' && (
                    <div className="bg-cream/30 border border-charcoal/5 rounded-xl p-4 mb-8 space-y-4 animate-fade-in">
                      <div className="flex flex-col">
                        <label className="text-xs font-bold text-charcoal/60 mb-1">Número do Cartão</label>
                        <input
                          type="text"
                          placeholder="0000 0000 0000 0000"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          className="bg-white border border-charcoal/20 px-3 py-2 rounded focus:outline-none focus:border-forest text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col">
                          <label className="text-xs font-bold text-charcoal/60 mb-1">Validade</label>
                          <input
                            type="text"
                            placeholder="MM/AA"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            className="bg-white border border-charcoal/20 px-3 py-2 rounded focus:outline-none focus:border-forest text-sm"
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="text-xs font-bold text-charcoal/60 mb-1">CVV</label>
                          <input
                            type="text"
                            placeholder="123"
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value)}
                            className="bg-white border border-charcoal/20 px-3 py-2 rounded focus:outline-none focus:border-forest text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between border-t border-charcoal/5 pt-4">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="px-6 py-2.5 border border-charcoal/20 hover:bg-charcoal/5 font-bold rounded-lg transition-colors"
                    >
                      ← Voltar
                    </button>
                    <button
                      type="button"
                      onClick={processarAgendamento}
                      disabled={!metodoOnline || criandoReserva}
                      className="bg-forest hover:bg-forest-dark disabled:opacity-40 text-white font-bold px-6 py-2.5 rounded-lg shadow transition-colors"
                    >
                      {criandoReserva ? 'Processando...' : 'Pagar e Confirmar'}
                    </button>
                  </div>
                </div>
              )}

              {/* QR Code Pix gerado para pagamento */}
              {qrCode && metodoOnline === 'Pix' && (
                <div className="flex flex-col items-center animate-fade-in">
                  <div className="w-44 h-44 bg-white border border-charcoal/15 rounded-lg flex items-center justify-center p-2 mb-4">
                    <img src={qrCode} alt="QR Code Pix" className="w-full h-full object-contain" />
                  </div>
                  <p className="text-xs text-charcoal/60 text-center mb-4 max-w-[280px]">
                    Abra o aplicativo de pagamentos do seu banco e escaneie o código Pix acima. O sistema atualizará automaticamente assim que pago.
                  </p>

                  <div className="w-full mb-6 text-left">
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
                  </div>                </div>
              )}
            </div>
          )}

          {/* STEP 4: Tela de Sucesso */}
          {step === 4 && (
            <div className="text-center py-8 animate-scale-up">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-4 border border-emerald-200">
                ✓
              </div>
              <h2 className="text-2xl font-bold text-forest mb-2">Reserva Confirmada!</h2>
              <p className="text-sm text-charcoal/60 mb-6 max-w-sm mx-auto">
                Seu agendamento foi realizado com sucesso. Um e-mail de confirmação e recibo foi enviado para você.
              </p>

              <div className="bg-cream/50 border border-charcoal/10 rounded-xl p-5 max-w-sm mx-auto text-left space-y-2.5 mb-8">
                <div className="flex justify-between text-xs text-charcoal/70">
                  <span>Data & Hora:</span>
                  <strong className="text-charcoal font-semibold">{formatData(selDate)} - {selTime}</strong>
                </div>
                <div className="flex justify-between text-xs text-charcoal/70">
                  <span>Quadra:</span>
                  <strong className="text-charcoal font-semibold">{selQuad?.nome}</strong>
                </div>
                <div className="flex justify-between text-xs text-charcoal/70">
                  <span>Código:</span>
                  <strong className="text-charcoal font-mono">#{reservaIdCriada}</strong>
                </div>
              </div>

              <div>
                <button
                  onClick={() => navigate('/portal')}
                  className="bg-forest hover:bg-forest-dark text-white font-bold px-6 py-2.5 rounded-lg shadow-md transition-colors text-sm"
                >
                  Ver Minhas Reservas
                </button>
              </div>
            </div>
          )}

        </div>
      </main>

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
