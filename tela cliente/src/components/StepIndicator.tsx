import { useEffect } from 'react';

interface Props {
  total: number;
  current: number;
}

const labels = ['Quadra & Data', 'Horário', 'Seus dados', 'Pagamento'];

export default function StepIndicator({ total, current }: Readonly<Props>) {
  useEffect(() => {}, []);
  return (
    <div className="px-4 pt-3 pb-2 bg-cream/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={i} className="flex-1 flex items-center gap-1.5">
              <div
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  active ? 'bg-charcoal' : done ? 'bg-available-border' : 'bg-edge'
                }`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">
          Passo {current + 1} de {total}
        </span>
        <span className="text-sm font-semibold text-charcoal">{labels[current]}</span>
      </div>
    </div>
  );
}
