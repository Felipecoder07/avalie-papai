import { useEffect, useMemo, useState, useCallback } from 'react';
import { X, Copy, Check, Clock, ShieldCheck, Loader2, Zap } from 'lucide-react';
import type { ReservationInput } from '../types';
import { brl, formatLongDate, mmss } from '../lib/format';
import { BACKEND_URL } from '../lib/backendUrl';

interface Props {
  readonly open: boolean;
  readonly slug?: string;
  readonly data: ReservationInput | null;
  readonly pixPayload?: {
    copia_cola: string;
    qr_code?: string | null;
    reserva_id?: number;
    expira_em_minutos?: number;
    expira_em_segundos?: number;
  } | null;
  readonly onClose: () => void;
  readonly onCancelPending?: () => void;
}

const PIX_DURATION = 15 * 60;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function buildPixCodeFallback(data: ReservationInput): string {
  const id = `${data.courtId}${data.dateISO.replace(/-/g, '')}${data.start.replace(':', '')}`;
  return `00020126360012BR.GOV.BCB.PIX0111arena@beachclub.com.br5204000053039865802BR5913ARENA BEACH6009FORTALEZA62${pad(
    id.length
  )}${id}6304ABCD`;
}

function qrMatrix(seed: string, size = 25): boolean[][] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rng = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
  const m: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(rng() > 0.5);
    m.push(row);
  }
  const placeFinder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const inner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        m[oy + y][ox + x] = edge || inner;
      }
    }
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const ix = ox + x, iy = oy + y;
        if (ix < size && iy < size && (x === 7 || y === 7)) m[iy][ix] = false;
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(size - 7, 0);
  placeFinder(0, size - 7);
  return m;
}

function calculateInitialSeconds(pixPayload?: Props['pixPayload']): number {
  if (pixPayload?.expira_em_segundos !== undefined) {
    return Math.max(0, Math.min(PIX_DURATION, pixPayload.expira_em_segundos));
  }
  if (pixPayload?.expira_em_minutos !== undefined) {
    return Math.max(0, Math.min(15, pixPayload.expira_em_minutos)) * 60;
  }
  return PIX_DURATION;
}

async function copyToClipboard(pixCode: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(pixCode);
      return;
    } catch {
      // Fallback
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = pixCode;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, 999999);
    document.execCommand('copy');
    document.body.removeChild(textarea);
  } catch {
    // Silently ignore fallback failure
  }
}

function useLockBodyScroll(open: boolean) {
  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [open]);
}

export default function PixModal({
  open,
  slug = 'felp-arena',
  data,
  pixPayload,
  onClose,
  onCancelPending
}: Props) {
  const [remaining, setRemaining] = useState(PIX_DURATION);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<'pending' | 'confirmed'>('pending');

  useLockBodyScroll(open);

  const pixCode = useMemo(() => {
    if (pixPayload?.copia_cola) return pixPayload.copia_cola;
    return data ? buildPixCodeFallback(data) : '';
  }, [data, pixPayload]);

  const matrix = useMemo(() => (data ? qrMatrix(pixCode) : []), [pixCode, data]);

  // Contagem regressiva
  useEffect(() => {
    if (!open) return;
    setRemaining(calculateInitialSeconds(pixPayload));
    setStatus('pending');
    setCopied(false);

    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          onCancelPending?.();
          return 0;
        }
        return r - 1;
      });
    }, 1000);

    return () => clearInterval(t);
  }, [open, pixPayload, onCancelPending]);

  // Polling de confirmação
  useEffect(() => {
    if (!open || status === 'confirmed' || !pixPayload?.reserva_id) return;

    const interval = setInterval(async () => {
      try {
        const safeSlug = String(slug || '').trim();
        const reservaIdNum = Number(pixPayload.reserva_id);
        if (!/^[a-zA-Z0-9_-]+$/.test(safeSlug) || !Number.isInteger(reservaIdNum) || reservaIdNum <= 0) {
          return;
        }
        const encodedSlug = encodeURIComponent(safeSlug);
        const encodedReservaId = encodeURIComponent(String(reservaIdNum));
        const res = await fetch(`${BACKEND_URL}/api/public/tenant/${encodedSlug}/status-reserva/${encodedReservaId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.status_pagamento === 'Pago') {
          setStatus('confirmed');
        } else if (json.status_pagamento === 'Expirado' || json.status === 'Cancelada') {
          setRemaining(0);
        }
      } catch {
        // Ignore network errors in polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [open, status, pixPayload?.reserva_id, slug]);

  const handleCloseModal = useCallback(() => {
    if (status === 'pending') {
      onCancelPending?.();
    }
    onClose();
  }, [status, onCancelPending, onClose]);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [pixCode]);

  if (!open || !data) return null;

  const expired = remaining === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-charcoal/50 animate-fadeIn cursor-pointer" 
        onClick={handleCloseModal}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCloseModal()}
        role="button"
        tabIndex={0}
        aria-label="Fechar modal"
      />
      <div className="relative w-full max-w-sm bg-card rounded-3xl shadow-sheet animate-scaleIn overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-pending-bg flex items-center justify-center text-pending-text font-bold text-xs">
              PIX
            </span>
            <h2 className="text-base font-bold text-charcoal">Pagamento Pix</h2>
          </div>
          <button
            onClick={handleCloseModal}
            className="tap -mr-2 flex items-center justify-center rounded-full text-muted active:bg-surface"
            aria-label="Fechar"
          >
            <X size={22} />
          </button>
        </div>

        <div className="px-5 pb-5">
          {/* Timer */}
          <div
            className={`rounded-2xl px-4 py-3 mb-4 flex items-center gap-2.5 ${
              status === 'confirmed'
                ? 'bg-available-bg text-available-text'
                : expired
                ? 'bg-error-bg text-error-text'
                : 'bg-pending-bg text-pending-text'
            }`}
          >
            <Clock size={18} />
            <p className="text-sm font-semibold">
              {status === 'confirmed'
                ? '🎉 Pagamento Confirmado com Sucesso!'
                : expired
                ? 'Tempo esgotado — A reserva foi cancelada e a vaga liberada'
                : `Pague em ${mmss(remaining)} para garantir sua vaga`}
            </p>
          </div>

          {/* Summary */}
          <div className="rounded-2xl bg-surface border border-edge p-3.5 mb-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">{data.courtName}</span>
              <span className="font-semibold text-charcoal">{data.start} - {data.end}</span>
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>{formatLongDate(data.dateISO)}</span>
              <span className="font-bold text-emerald-600 text-sm">{brl(data.price)}</span>
            </div>
          </div>

          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center bg-surface border border-edge rounded-2xl p-4 mb-4">
            {status === 'confirmed' ? (
              <div className="py-6 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-available-bg text-available-text rounded-full flex items-center justify-center mb-3">
                  <Check size={36} strokeWidth={3} />
                </div>
                <h3 className="font-bold text-lg text-charcoal">Reserva Garantida!</h3>
                <p className="text-xs text-muted mt-1 max-w-[200px]">
                  Identificamos seu pagamento automaticamente pelo banco.
                </p>
              </div>
            ) : pixPayload?.qr_code ? (
              <div className="relative">
                <img
                  src={pixPayload.qr_code.startsWith('data:') ? pixPayload.qr_code : `data:image/png;base64,${pixPayload.qr_code}`}
                  alt="QR Code Pix"
                  className="w-48 h-48 rounded-xl object-contain border border-edge bg-white p-2"
                />
                {expired && (
                  <div className="absolute inset-0 bg-charcoal/70 backdrop-blur-[2px] rounded-xl flex items-center justify-center text-white text-xs font-bold p-3 text-center">
                    QR Code Expirado
                  </div>
                )}
              </div>
            ) : (
              <div className="w-48 h-48 bg-white p-2 rounded-xl border border-edge grid grid-cols-25 gap-[1px]">
                {matrix.flat().map((filled, i) => (
                  <div key={i} className={filled ? 'bg-charcoal' : 'bg-white'} />
                ))}
              </div>
            )}

            {status === 'pending' && !expired && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                <Loader2 size={13} className="animate-spin text-accent" />
                <span>Aguardando confirmação bancária...</span>
              </div>
            )}
          </div>

          {/* Copy Button */}
          {status !== 'confirmed' && (
            <button
              onClick={handleCopy}
              disabled={expired}
              className={`w-full py-3.5 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : expired
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-accent text-white hover:bg-accent-hover active:scale-[0.99]'
              }`}
            >
              {copied ? (
                <>
                  <Check size={18} />
                  Código Copiado com Sucesso!
                </>
              ) : (
                <>
                  <Copy size={18} />
                  Copiar Código Pix (Copia e Cola)
                </>
              )}
            </button>
          )}

          {status === 'confirmed' && (
            <button
              onClick={handleCloseModal}
              className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.99]"
            >
              Ver Minhas Reservas
            </button>
          )}

          <div className="mt-3 flex items-center justify-center gap-1 text-[11px] text-muted">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Pagamento 100% seguro via Banco Central do Brasil</span>
          </div>
        </div>
      </div>
    </div>
  );
}
