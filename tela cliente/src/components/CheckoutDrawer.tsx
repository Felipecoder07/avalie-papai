import { useEffect, useState, useRef } from 'react';
import { X, ArrowRight, User, Phone, CreditCard, Check, Clock } from 'lucide-react';
import type { Slot, Court } from '../types';
import { brl, maskPhone, maskCPF, formatLongDate } from '../lib/format';

interface Props {
  open: boolean;
  slots: Slot[];
  court: Court | null;
  selectedSport?: string;
  onSportChange?: (sport: string) => void;
  initialName?: string;
  initialPhone?: string;
  onClose: () => void;
  onConfirm: (data: { slots: Slot[]; name: string; phone: string; cpf: string; sport?: string }) => Promise<void> | void;
}

export default function CheckoutDrawer({ 
  open, 
  slots, 
  court, 
  selectedSport,
  initialName = '', 
  initialPhone = '', 
  onClose, 
  onConfirm 
}: Readonly<Props>) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [cpf, setCpf] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    if (diff > 0) {
      setTranslateY(diff);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (translateY > 90) {
      onClose();
    }
    setTranslateY(0);
  };

  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTouched(false);
      setSubmitting(false);
      setTranslateY(0);
      if (initialName) setName(initialName);
      if (initialPhone) setPhone(initialPhone);
    }
  }, [open, initialName, initialPhone]);

  if (!open || slots.length === 0 || !court) return null;

  const currentSport = selectedSport || slots[0]?.sport || court.modalities?.[0] || 'Beach Tennis';
  const totalPrice = slots.reduce((acc, s) => acc + s.price, 0);

  const nameValid = name.trim().length >= 3;
  const phoneValid = phone.replace(/\D/g, '').length === 11;
  const cpfValid = cpf.trim() === '' || cpf.replace(/\D/g, '').length === 11;
  const canSubmit = nameValid && phoneValid && cpfValid && !submitting;

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({
        slots,
        name: name.trim(),
        phone,
        cpf,
        sport: currentSport
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-charcoal/40 animate-fadeIn"
        role="presentation"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); }}
      />
      <div
        style={{
          transform: translateY > 0 ? `translateY(${translateY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        className="relative bg-card rounded-t-3xl shadow-sheet animate-slideUp max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="sticky top-0 z-20 bg-card border-b border-edge/40 flex items-center justify-between px-5 pt-3 pb-3 shrink-0 cursor-grab active:cursor-grabbing select-none"
        >
          <div className="w-10 h-1.5 rounded-full bg-edge/80 mx-auto absolute left-1/2 -translate-x-1/2 top-2.5" />
          <h2 className="text-base font-bold text-charcoal mt-2">Confirmar Reserva ({slots.length} {slots.length === 1 ? 'horário' : 'horários'})</h2>
          <button
            onClick={onClose}
            className="tap -mr-2 flex items-center justify-center rounded-full text-muted active:bg-surface mt-2"
            aria-label="Fechar"
          >
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pt-4 pb-5 flex-1 overscroll-contain">
          <div className="rounded-2xl bg-surface border border-edge p-4 mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-muted uppercase tracking-wide block">Total a Pagar</span>
                <span className="text-xs font-bold text-charcoal mt-0.5 inline-block bg-card px-2 py-0.5 rounded-md border border-edge">
                  {currentSport}
                </span>
              </div>
              <span className="text-xl font-bold text-available-text">{brl(totalPrice)}</span>
            </div>

            <div className="border-t border-edge pt-2 space-y-2">
              <span className="text-xs font-bold text-charcoal block mb-1">Horários Selecionados:</span>
              {slots.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs bg-card p-2 rounded-xl border border-edge">
                  <div className="flex items-center gap-1.5 font-medium text-charcoal">
                    <Clock size={14} className="text-available-text shrink-0" />
                    <span>{court.name} · {formatLongDate(s.dateISO)} ({s.start} às {s.end})</span>
                  </div>
                  <span className="font-bold text-charcoal">{brl(s.price)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3.5">
            <Field
              icon={<User size={18} />}
              label="Nome completo"
              error={touched && !nameValid ? 'Informe seu nome completo' : ''}
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João da Silva"
                className="w-full bg-transparent outline-none text-base text-charcoal placeholder:text-muted/60"
                autoCapitalize="words"
              />
            </Field>

            <Field
              icon={<Phone size={18} />}
              label="WhatsApp"
              error={touched && !phoneValid ? 'Digite um celular válido com DDD' : ''}
            >
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                placeholder="(00) 000000000"
                className="w-full bg-transparent outline-none text-base text-charcoal placeholder:text-muted/60"
              />
            </Field>

            <Field
              icon={<CreditCard size={18} />}
              label="CPF (Opcional para recibo Pix)"
              error={touched && !cpfValid ? 'CPF inválido' : ''}
            >
              <input
                type="text"
                inputMode="numeric"
                value={cpf}
                onChange={(e) => setCpf(maskCPF(e.target.value))}
                placeholder="000.000.000-00"
                className="w-full bg-transparent outline-none text-base text-charcoal placeholder:text-muted/60"
              />
            </Field>
          </div>
        </div>

        <div className="shrink-0 px-5 pt-3 pb-5 safe-bottom border-t border-edge bg-card rounded-b-3xl">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`tap w-full flex items-center justify-center gap-2 rounded-2xl text-base font-bold transition active:scale-[0.98] h-13 ${
              canSubmit
                ? 'bg-available-text text-white shadow-soft'
                : 'bg-available-text/40 text-white cursor-not-allowed opacity-60'
            }`}
          >
            {submitting ? (
              <span className="flex items-center gap-2">Gerando Pix...</span>
            ) : (
              <>
                Pagar Pix ({brl(totalPrice)})
                <ArrowRight size={18} />
              </>
            )}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted flex items-center justify-center gap-1">
            <Check size={12} className="text-available-text" /> Reserva segura · cancelamento grátis em 24h
          </p>
        </div>
      </div>
    </div>
  );
}


function Field({
  icon,
  label,
  error,
  children,
}: Readonly<{
  icon: React.ReactNode;
  label: string;
  error?: string;
  children: React.ReactNode;
}>) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted mb-1.5 ml-1">{label}</label>
      <div
        className={`flex items-center gap-2.5 rounded-2xl border bg-card px-3.5 h-14 transition ${
          error ? 'border-error-text/60' : 'border-edge focus-within:border-charcoal/40'
        }`}
      >
        <span className="text-muted">{icon}</span>
        {children}
      </div>
      {error && <p className="text-xs text-error-text mt-1 ml-1">{error}</p>}
    </div>
  );
}
