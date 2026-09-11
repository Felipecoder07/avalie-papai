import { useState, useEffect } from 'react';
import { X, Search, CalendarCheck, Clock, Loader2, Ticket, QrCode, ArrowRight, Ban, CheckCircle2, MessageCircle, AlertTriangle, ShieldCheck, Printer, Share2, FileText, Building2 } from 'lucide-react';
import { brl, maskPhone, formatLongDate } from '../lib/format';



import { BACKEND_URL } from '../lib/backendUrl';


interface Props {
  slug: string;
  athlete?: { name: string; email: string; phone: string } | null;
  open: boolean;
  onClose: () => void;
  onPayPending?: (reservaId: number) => void;
}

interface ReservaItem {
  id: number;
  quadra_id: number;
  quadra_nome: string;
  data_reserva: string;
  hora_inicio: string;
  hora_fim: string;
  valor_total: number;
  total_horarios?: number;
  grupo_id?: string;
  status: string;
  status_pagamento: string;
  criado_em: string;
  codigo_validacao_cancelamento?: string;
  cliente_nome?: string;
  cliente_email?: string;
  cliente_telefone?: string;
  cliente_cpf?: string;
  gateway_ref?: string;
  metodo_gateway?: string;
  status_gateway?: string;
  data_gateway?: string;
  metodo_pagamento?: string;
  data_pagamento?: string;
  arena?: {
    nome: string;
    endereco: string;
    telefone: string;
    email: string;
    titular_pix: string;
  };
}


interface CancelResult {
  reserva_id: number;
  refund_status: 'automatic' | 'manual' | 'none';
  message: string;
  codigo_validacao: string;
  arena: {
    nome: string;
    telefone: string;
  };
  reserva: {
    id: number;
    quadra_nome: string;
    data_reserva: string;
    hora_inicio: string;
    hora_fim: string;
    valor_total: number;
    cliente_nome: string;
    cliente_email: string;
    cliente_telefone: string;
    cliente_cpf: string;
  };
}

export default function MyReservations({ slug, athlete, open, onClose, onPayPending }: Readonly<Props>) {
  const [phone, setPhone] = useState(athlete?.phone || '');
  const [reservas, setReservas] = useState<ReservaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Estados para Modal de Cancelamento & Reembolso & Recibo Detalhado
  const [confirmCancelReserva, setConfirmCancelReserva] = useState<ReservaItem | null>(null);
  const [cancelingLoading, setCancelingLoading] = useState(false);
  const [cancelModalData, setCancelModalData] = useState<CancelResult | null>(null);
  const [selectedReceiptReserva, setSelectedReceiptReserva] = useState<ReservaItem | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);


  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [open]);

  const fetchReservas = async (customPhone?: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('courtmanager_athlete_token') || localStorage.getItem('atleta_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const targetPhone = customPhone !== undefined ? customPhone : phone;
      const queryPhone = targetPhone ? `?telefone=${encodeURIComponent(targetPhone)}` : '';
      
      const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/minhas-reservas${queryPhone}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const sorted = Array.isArray(data) ? [...data].sort((a, b) => {
          const aCancelada = a.status === 'Cancelada' || a.status_pagamento === 'Estornado' || a.status_pagamento === 'Expirado' || a.status_pagamento === 'Desistência';
          const bCancelada = b.status === 'Cancelada' || b.status_pagamento === 'Estornado' || b.status_pagamento === 'Expirado' || b.status_pagamento === 'Desistência';

          const aPassada = isReservaPassada(a.data_reserva, a.hora_inicio);
          const bPassada = isReservaPassada(b.data_reserva, b.hora_inicio);

          const aPending = (a.status === 'Pendente' || a.status_pagamento === 'Pendente') && !aCancelada && !aPassada;
          const bPending = (b.status === 'Pendente' || b.status_pagamento === 'Pendente') && !bCancelada && !bPassada;

          const aAtiva = !aCancelada && !aPassada;
          const bAtiva = !bCancelada && !bPassada;

          const getRank = (isPend: boolean, isAtv: boolean, isPas: boolean, isCanc: boolean) => {
            if (isCanc) return 3;
            if (isPas) return 2;
            if (isPend) return 0;
            if (isAtv) return 1;
            return 2;
          };

          const rankA = getRank(aPending, aAtiva, aPassada, aCancelada);
          const rankB = getRank(bPending, bAtiva, bPassada, bCancelada);

          if (rankA !== rankB) return rankA - rankB;

          // Para ativas/futuras (ranks 0 e 1): ordena por data mais próxima primeiro (ASC)
          if (rankA <= 1) {
            if (a.data_reserva !== b.data_reserva) return a.data_reserva.localeCompare(b.data_reserva);
            return a.hora_inicio.localeCompare(b.hora_inicio);
          }

          // Para passadas/canceladas (ranks 2 e 3): ordena por data mais recente primeiro (DESC)
          if (a.data_reserva !== b.data_reserva) return b.data_reserva.localeCompare(a.data_reserva);
          return b.hora_inicio.localeCompare(a.hora_inicio);
        }) : [];
        setReservas(sorted);
        setSearched(true);
      }
    } catch (err) {
      console.error('Erro ao buscar minhas reservas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (athlete?.phone) {
      setPhone(athlete.phone);
    }
    fetchReservas(athlete?.phone);
  }, [open, slug, athlete]);

  if (!open) return null;

  const handleSearchClick = () => {
    fetchReservas();
  };

  const handleExecuteCancellation = async (reservaId: number) => {
    setCancelingLoading(true);
    setToastMessage(null);
    try {
      const token = localStorage.getItem('courtmanager_athlete_token') || localStorage.getItem('atleta_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/cancelar-reserva/${reservaId}`, {
        method: 'POST',
        headers
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setConfirmCancelReserva(null);
        if (data.refund_status === 'manual') {
          setCancelModalData(data);
        } else if (data.refund_status === 'automatic') {
          setToastMessage({
            type: 'success',
            text: 'Reserva cancelada! O valor foi estornado automaticamente via Pix no Mercado Pago.'
          });
        } else {
          setToastMessage({
            type: 'success',
            text: 'Reserva cancelada com sucesso.'
          });
        }
        fetchReservas();
      } else {
        setToastMessage({
          type: 'error',
          text: data.error || 'Erro ao cancelar reserva.'
        });
      }
    } catch (err) {
      console.error('Erro ao cancelar reserva:', err);
      setToastMessage({
        type: 'error',
        text: 'Falha na conexão ao cancelar reserva.'
      });
    } finally {
      setCancelingLoading(false);
    }
  };

  const isReservaPassada = (dataIso: string, horaInicio: string) => {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      if (dataIso < todayStr) return true;
      if (dataIso === todayStr) {
        const hours = String(today.getHours()).padStart(2, '0');
        const minutes = String(today.getMinutes()).padStart(2, '0');
        const currentTimeStr = `${hours}:${minutes}`;
        return horaInicio <= currentTimeStr;
      }
      return false;
    } catch {
      return false;
    }
  };

  const getStatusBadge = (r: ReservaItem) => {
    const passada = isReservaPassada(r.data_reserva, r.hora_inicio);

    if (r.status === 'Cancelada' || r.status_pagamento === 'Estornado') {
      return <span className="text-[11px] font-bold uppercase rounded-full px-2 py-0.5 border bg-neutral-100 text-neutral-600 border-neutral-200">Cancelada</span>;
    }
    if (r.status_pagamento === 'Expirado' || r.status_pagamento === 'Desistência') {
      return <span className="text-[11px] font-bold uppercase rounded-full px-2 py-0.5 border bg-neutral-100 text-neutral-600 border-neutral-200">Expirado</span>;
    }
    if (passada) {
      return <span className="text-[11px] font-bold uppercase rounded-full px-2 py-0.5 border bg-neutral-100 text-neutral-500 border-neutral-200">Concluída</span>;
    }
    if (r.status_pagamento === 'Pago') {
      return <span className="text-[11px] font-bold uppercase rounded-full px-2 py-0.5 border bg-available-bg text-available-text border-available-border">Confirmada · Pago</span>;
    }
    return <span className="text-[11px] font-bold uppercase rounded-full px-2 py-0.5 border bg-pending-bg text-pending-text border-pending-bg">Pendente</span>;
  };


  const openWhatsAppRefund = (data: CancelResult) => {
    const rawPhone = data.arena.telefone ? data.arena.telefone.replace(/\D/g, '') : '';
    const phoneNum = rawPhone.length <= 11 ? `55${rawPhone}` : rawPhone;

    const pinEmoji = String.fromCodePoint(0x1F4CD);
    const userEmoji = String.fromCodePoint(0x1F464);
    const ballEmoji = String.fromCodePoint(0x1F3BE);
    const calEmoji = String.fromCodePoint(0x1F4C5);
    const moneyEmoji = String.fromCodePoint(0x1F4B0);

    const textMsg = 
`*SOLICITAÇÃO DE ESTORNO DE PIX*

Olá! Acabei de cancelar a minha reserva pelo aplicativo e gostaria de solicitar o estorno do meu Pix.

${pinEmoji} *DADOS DA RESERVA CANCELADA:*
• *Reserva nº:* #${data.reserva.id}
• *Código de Validação:* ${data.codigo_validacao}
${userEmoji} *Cliente:* ${data.reserva.cliente_nome}
• *CPF:* ${data.reserva.cliente_cpf}
• *E-mail:* ${data.reserva.cliente_email}
${ballEmoji} *Quadra:* ${data.reserva.quadra_nome}
${calEmoji} *Data/Horário:* ${formatLongDate(data.reserva.data_reserva)} às ${data.reserva.hora_inicio}
${moneyEmoji} *Valor Pago:* R$ ${data.reserva.valor_total.toFixed(2)}`;

    const url = `https://api.whatsapp.com/send?phone=${phoneNum}&text=${encodeURIComponent(textMsg)}`;
    window.open(url, '_blank');
  };





  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-charcoal/50 animate-fadeIn"
        role="presentation"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); }}
      />
      <div className="relative w-full max-w-[395px] bg-card rounded-3xl shadow-sheet animate-scaleIn max-h-[80vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0 border-b border-edge">
          <h2 className="text-base font-bold text-charcoal flex items-center gap-2">
            <Ticket size={18} className="text-charcoal" />
            Minhas reservas
          </h2>
          <button
            onClick={onClose}
            className="tap -mr-2 flex items-center justify-center rounded-full text-muted active:bg-surface p-1"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Notificação Toast */}
        {toastMessage && (
          <div className={`px-5 py-2.5 text-xs font-semibold flex items-center justify-between gap-2 shrink-0 ${
            toastMessage.type === 'success' ? 'bg-available-bg text-available-text border-b border-available-border' : 'bg-error-bg text-error-text border-b border-rose-200'
          }`}>
            <span className="flex items-center gap-1.5">
              {toastMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {toastMessage.text}
            </span>
            <button onClick={() => setToastMessage(null)} className="opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="px-5 py-4 overflow-y-auto space-y-4 flex-1">
          {!athlete && (
            <>
              <p className="text-sm text-muted mb-3">
                Informe o WhatsApp usado nas suas reservas para consultá-las.
              </p>
              <div className="flex items-center gap-2 rounded-2xl border border-edge bg-cream px-3.5 h-14 mb-4">
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  placeholder="(00) 000000000"
                  className="flex-1 bg-transparent outline-none text-base text-charcoal placeholder:text-muted/60"
                />
                <button
                  onClick={handleSearchClick}
                  disabled={loading}
                  className="tap shrink-0 flex items-center gap-1.5 rounded-xl bg-charcoal text-white px-3 h-11 text-sm font-semibold active:scale-95 transition disabled:opacity-50"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Buscar
                </button>
              </div>
            </>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted text-sm">
              <Loader2 size={24} className="animate-spin text-charcoal" />
              <span>Carregando suas reservas...</span>
            </div>
          )}

          {!loading && searched && reservas.length > 0 && (
            <div className="space-y-3 animate-fadeIn">
              {reservas.map((r) => {
                const isCancelada = r.status === 'Cancelada' || r.status_pagamento === 'Estornado' || r.status_pagamento === 'Expirado' || r.status_pagamento === 'Desistência';
                const isPassada = isReservaPassada(r.data_reserva, r.hora_inicio);
                const isPago = r.status_pagamento === 'Pago' || r.status === 'Confirmada';
                const canCancel = !isCancelada && !isPassada;

                const borderLeftColor = isCancelada
                  ? 'border-l-[5px] border-l-rose-500'
                  : isPago
                  ? 'border-l-[5px] border-l-emerald-500'
                  : 'border-l-[5px] border-l-amber-500';

                return (
                  <div key={r.id} className={`rounded-2xl border ${borderLeftColor} p-4 transition ${isCancelada || isPassada ? 'border-edge/50 bg-neutral-50/60 opacity-90' : 'border-edge bg-surface'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CalendarCheck size={16} className="text-muted" />
                        <span className="font-semibold text-charcoal text-sm">{r.quadra_nome}</span>
                      </div>
                      {getStatusBadge(r)}
                    </div>

                    <div className="space-y-1 text-sm text-muted">
                      <p className="flex items-center gap-2">
                        <CalendarCheck size={14} /> {formatLongDate(r.data_reserva)}
                      </p>
                      <p className="flex items-center gap-2">
                        <Clock size={14} /> {r.hora_inicio} às {r.hora_fim}
                        {r.total_horarios && r.total_horarios > 1 && (
                          <span className="text-[10px] font-bold text-available-text bg-available-bg px-2 py-0.5 rounded-md border border-available-border">
                            {r.total_horarios} horários
                          </span>
                        )}
                      </p>
                      <p className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-edge/60">
                        <button
                          onClick={() => setSelectedReceiptReserva(r)}
                          className="tap inline-flex items-center gap-1.5 text-xs font-bold text-charcoal/80 bg-cream hover:bg-cream/70 px-2.5 py-1 rounded-lg border border-edge/80 active:scale-95 transition shadow-2xs cursor-pointer"
                        >
                          <Ticket size={13} className="text-available-text" />
                          Comprovante #{r.id}
                        </button>
                        <span className="font-bold text-charcoal">{brl(r.valor_total)}</span>
                      </p>


                      {/* Ações de Pendência de Pix */}
                      {(r.status === 'Pendente' || r.status_pagamento === 'Pendente') && !isCancelada && !isPassada && (
                        <div className="mt-3 pt-2.5 border-t border-edge/60 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-amber-600 font-semibold flex items-center gap-1">
                            <QrCode size={13} /> Pix não concluído
                          </span>
                          {onPayPending && (
                            <button
                              onClick={() => {
                                onClose();
                                onPayPending(r.id);
                              }}
                              className="tap px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition"
                            >
                              <QrCode size={13} />
                              Pagar Pix Agora
                              <ArrowRight size={13} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Botão de Cancelar Reserva (Somente em reservas ativas e FUTURAS) */}
                      {canCancel && (
                        <div className="mt-3 pt-2 border-t border-edge/60 flex justify-end">
                          <button
                            onClick={() => setConfirmCancelReserva(r)}
                            className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-rose-50 transition"
                          >
                            <Ban size={14} />
                            Cancelar Reserva
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

            </div>
          )}

          {!loading && searched && reservas.length === 0 && (
            <div className="text-center py-8 text-sm text-muted">
              Nenhuma reserva encontrada para a sua conta nesta arena.
            </div>
          )}
        </div>
      </div>


      {/* Modal de Confirmação de Cancelamento */}
      {confirmCancelReserva && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scaleIn">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="font-bold text-charcoal text-base">Confirmar Cancelamento</h3>
                <p className="text-xs text-muted">Reserva #{confirmCancelReserva.id} · {confirmCancelReserva.quadra_nome}</p>
              </div>
            </div>

            <p className="text-sm text-charcoal/80 bg-cream/70 p-3 rounded-2xl border border-edge/80">
              Tem certeza que deseja cancelar sua reserva para o dia <strong>{formatLongDate(confirmCancelReserva.data_reserva)}</strong> às <strong>{confirmCancelReserva.hora_inicio}</strong>?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmCancelReserva(null)}
                disabled={cancelingLoading}
                className="px-4 py-2.5 text-xs font-bold text-muted hover:text-charcoal transition"
              >
                Voltar
              </button>
              <button
                onClick={() => handleExecuteCancellation(confirmCancelReserva.id)}
                disabled={cancelingLoading}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition disabled:opacity-50"
              >
                {cancelingLoading ? <Loader2 size={16} className="animate-spin" /> : <Ban size={15} />}
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Solicitação de Estorno Manual via WhatsApp com Código de Verificação */}
      {cancelModalData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scaleIn">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 size={20} />
                <h3 className="font-bold text-charcoal text-base">Reserva Cancelada!</h3>
              </div>
              <button onClick={() => setCancelModalData(null)} className="text-muted hover:text-charcoal">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Sua reserva foi cancelada com sucesso no sistema. Como o pagamento foi realizado via Pix direto para a chave da arena, envie os dados abaixo ao suporte da arena para conferência e reembolso.
            </p>

            {/* Card com Código de Validação de Segurança */}
            <div className="bg-cream/90 rounded-2xl p-3.5 border border-edge text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-edge/60 pb-2">
                <span className="font-bold text-charcoal flex items-center gap-1">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  Código de Autenticidade:
                </span>
                <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {cancelModalData.codigo_validacao}
                </span>
              </div>
              
              <div className="space-y-1 text-charcoal/80 pt-1">
                <p><strong>Reserva nº:</strong> #{cancelModalData.reserva.id}</p>
                <p><strong>Cliente:</strong> {cancelModalData.reserva.cliente_nome}</p>
                <p><strong>CPF:</strong> {cancelModalData.reserva.cliente_cpf}</p>
                <p><strong>Valor a Estornar:</strong> <span className="font-bold text-charcoal">{brl(cancelModalData.reserva.valor_total)}</span></p>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                onClick={() => openWhatsAppRefund(cancelModalData)}
                className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition"
              >
                <MessageCircle size={18} />
                Enviar Solicitação no WhatsApp
              </button>

              <button
                onClick={() => setCancelModalData(null)}
                className="w-full py-2 text-xs font-semibold text-muted hover:text-charcoal transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Comprovante / Recibo Digital Detalhado */}

      {selectedReceiptReserva && (
        <ReceiptModal
          reserva={selectedReceiptReserva}
          onClose={() => setSelectedReceiptReserva(null)}
        />
      )}


    </div>
  );
}

const EMOJI = {
  building: String.fromCodePoint(0x1F3E2),
  ball: String.fromCodePoint(0x1F3BE),
  calendar: String.fromCodePoint(0x1F4C5),
  user: String.fromCodePoint(0x1F464),
  money: String.fromCodePoint(0x1F4B0),
  card: String.fromCodePoint(0x1F4B3),
  check: String.fromCodePoint(0x2705),
  hourglass: String.fromCodePoint(0x23F3),
  pin: String.fromCodePoint(0x1F4CD)
};


function ReceiptModal({ reserva, onClose }: Readonly<{ reserva: ReservaItem; onClose: () => void }>) {
  const handlePrint = () => {
    window.print();
  };

  const handleShare = () => {
    const rawPhone = reserva.arena?.telefone ? reserva.arena.telefone.replace(/\D/g, '') : '';
    const phoneNum = rawPhone.length <= 11 ? `55${rawPhone}` : rawPhone;
    const textMsg = 
`*RECIBO DE RESERVA #${reserva.id}*
${EMOJI.building} Arena: ${reserva.arena?.nome || 'Arena'}
${EMOJI.ball} Quadra: ${reserva.quadra_nome}
${EMOJI.calendar} Data/Horário: ${formatLongDate(reserva.data_reserva)} (${reserva.hora_inicio} às ${reserva.hora_fim})
${EMOJI.user} Atleta: ${reserva.cliente_nome || 'Cliente'}
${EMOJI.money} Valor Pago: ${brl(reserva.valor_total)}
${EMOJI.card} Status: ${reserva.status_pagamento === 'Pago' ? 'PAGO' : reserva.status_pagamento}`;

    const url = `https://api.whatsapp.com/send?phone=${phoneNum}&text=${encodeURIComponent(textMsg)}`;
    window.open(url, '_blank');
  };


  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'Não informado';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const pagamentoMetodoText = () => {
    if (reserva.metodo_gateway) return `Pix Online (Mercado Pago)`;
    if (reserva.metodo_pagamento) return reserva.metodo_pagamento;
    if (reserva.status_pagamento === 'Pago') return 'Pix Online';
    return 'Pix Pendente';
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scaleIn relative overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-edge pb-3">
          <div className="flex items-center gap-2 text-charcoal font-bold text-sm">
            <FileText size={18} className="text-available-text" />
            Recibo de Agendamento
          </div>
          <button onClick={onClose} className="text-muted hover:text-charcoal p-1">
            <X size={18} />
          </button>
        </div>

        {/* Ticket Digital Body */}
        <div className="bg-cream/90 rounded-2xl p-4 border border-edge/80 space-y-3 relative text-xs text-charcoal shadow-inner">
          {/* Arena Info */}
          <div className="text-center pb-3 border-b border-dashed border-edge">
            <h4 className="font-bold text-sm text-charcoal">{reserva.arena?.nome || 'Arena'}</h4>
            {reserva.arena?.endereco && <p className="text-[11px] text-muted mt-0.5">{reserva.arena.endereco}</p>}
            {reserva.arena?.telefone && <p className="text-[11px] text-muted">Tel/Whats: {reserva.arena.telefone}</p>}
          </div>

          {/* Status Badge */}
          <div className="flex items-center justify-between py-1">
            <span className="text-muted font-medium">Status do Pagamento:</span>
            {reserva.status_pagamento === 'Pago' ? (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-available-bg text-available-text border border-available-border flex items-center gap-1">
                {EMOJI.check} Pago & Confirmado
              </span>
            ) : reserva.status === 'Cancelada' || reserva.status_pagamento === 'Estornado' ? (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-100 text-neutral-600 border border-neutral-200">
                Cancelada / Estornado
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-1">
                {EMOJI.hourglass} Pendente
              </span>
            )}
          </div>


          {/* Detalhes da Reserva */}
          <div className="space-y-1.5 py-2 border-y border-dashed border-edge text-charcoal/90">
            <div className="flex justify-between">
              <span className="text-muted">Comprovante nº:</span>
              <span className="font-bold font-mono">#{reserva.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Quadra:</span>
              <span className="font-bold">{reserva.quadra_nome}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Data do Jogo:</span>
              <span className="font-semibold">{formatLongDate(reserva.data_reserva)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Horário:</span>
              <span className="font-semibold">{reserva.hora_inicio} às {reserva.hora_fim}</span>
            </div>
          </div>

          {/* Dados do Cliente / Titular */}
          <div className="space-y-1.5 py-2 border-b border-dashed border-edge text-charcoal/90">
            <div className="flex justify-between">
              <span className="text-muted">Atleta:</span>
              <span className="font-bold">{reserva.cliente_nome || 'Atleta'}</span>
            </div>
            {reserva.cliente_cpf && (
              <div className="flex justify-between">
                <span className="text-muted">CPF:</span>
                <span>{reserva.cliente_cpf}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted">Forma de Pagamento:</span>
              <span className="font-medium text-emerald-700">{pagamentoMetodoText()}</span>
            </div>
            {reserva.gateway_ref && (
              <div className="flex justify-between">
                <span className="text-muted">Transação / Ref:</span>
                <span className="font-mono text-[10px] truncate max-w-[150px]">{reserva.gateway_ref}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted">Data de Emissão:</span>
              <span>{formatDateTime(reserva.data_pagamento || reserva.criado_em)}</span>
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between pt-1 text-sm font-bold">
            <span>VALOR TOTAL:</span>
            <span className="text-available-text text-base">{brl(reserva.valor_total)}</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-2 pt-1">
          <button
            onClick={handleShare}
            className="w-full h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition active:scale-[0.98]"
          >
            <Share2 size={16} />
            Compartilhar Recibo no WhatsApp
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex-1 h-10 rounded-2xl border border-edge bg-cream hover:bg-cream/70 text-charcoal font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
            >
              <Printer size={15} />
              Imprimir / PDF
            </button>
            <button
              onClick={onClose}
              className="px-4 h-10 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-charcoal font-semibold text-xs transition"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


