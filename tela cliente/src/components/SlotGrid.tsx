import { Sun, Sunset, Moon, Check } from 'lucide-react';
import type { Slot } from '../types';
import { brl } from '../lib/format';

interface Props {
  slots: Slot[];
  selectedSlotIds?: string[];
  onSelect: (slot: Slot) => void;
  showPrice?: boolean;
}

const blocks: { key: Slot['block']; label: string; Icon: typeof Sun }[] = [
  { key: 'manha', label: 'Manhã', Icon: Sun },
  { key: 'tarde', label: 'Tarde', Icon: Sunset },
  { key: 'noite', label: 'Noite', Icon: Moon },
];

export default function SlotGrid({ slots, selectedSlotIds = [], onSelect, showPrice = true }: Readonly<Props>) {
  const freeCount = slots.filter((s) => s.status === 'free').length;

  return (
    <section className="px-4 pt-5 pb-32">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-bold text-charcoal">Horários disponíveis</h2>
        <span className="text-xs text-available-text font-semibold">{freeCount} livres</span>
      </div>

      {blocks.map(({ key, label, Icon }) => {
        const group = slots.filter((s) => s.block === key);
        if (group.length === 0) return null;
        return (
          <div key={key} className="mb-5">
            <div className="flex items-center gap-2 mb-2.5">
              <Icon size={16} className="text-muted" />
              <h3 className="text-sm font-semibold text-charcoal">{label}</h3>
              <div className="flex-1 h-px bg-edge" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {group.map((s) => {
                const isSelected = selectedSlotIds.includes(s.id);
                if (s.status === 'free') {
                  return (
                    <button
                      key={s.id}
                      onClick={() => onSelect(s)}
                      className={`tap flex flex-col items-start justify-center rounded-xl2 px-3.5 py-2.5 border transition active:scale-[0.98] ${
                        isSelected
                          ? 'bg-charcoal text-white border-charcoal shadow-soft'
                          : 'border-available-border bg-available-bg text-available-text'
                      }`}
                    >
                      <div className="w-full flex items-center justify-between">
                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-available-text'}`}>
                          {s.start} – {s.end}
                        </span>
                        {isSelected && <Check size={16} className="text-amber-400 font-bold" />}
                      </div>
                      <span className={`text-xs font-semibold ${isSelected ? 'text-white/80' : 'text-available-text/80'}`}>
                        {isSelected || showPrice ? brl(s.price) : 'Disponível'}
                      </span>
                    </button>
                  );
                }

                const isPast = s.status === 'past';
                return (
                  <div
                    key={s.id}
                    className="tap flex flex-col items-start justify-center rounded-xl2 px-3.5 py-2.5 border border-edge bg-blocked-bg opacity-75 select-none"
                  >
                    <span className="text-sm font-semibold text-blocked-text/60">{s.start} – {s.end}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blocked-text/50">
                      <span className={`w-1.5 h-1.5 rounded-full ${isPast ? 'bg-amber-500/60' : 'bg-blocked-text/40'}`} />
                      {isPast ? 'Encerrado' : 'Ocupado'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
