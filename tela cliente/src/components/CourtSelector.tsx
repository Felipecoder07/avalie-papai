import type { Court } from '../types';
import { brl } from '../lib/format';

interface Props {
  courts: Court[];
  selectedId: string;
  onSelect: (id: string) => void;
  selectedSport?: string;
  availableSports?: string[];
  onSelectSport?: (sport: string) => void;
}

export default function CourtSelector({ 
  courts, 
  selectedId, 
  onSelect,
  selectedSport = 'Todos',
  availableSports = [],
  onSelectSport
}: Readonly<Props>) {
  return (
    <section className="px-4 pt-5">
      {/* Barra de Filtro de Modalidades / Esportes */}
      {availableSports && availableSports.length > 1 && onSelectSport && (
        <div className="mb-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Modalidade Esportiva</span>
          </div>
          <div className="-mx-4 px-4 overflow-x-auto no-scrollbar">
            <div className="flex gap-2 w-max pb-1">
              {availableSports.map((sport) => {
                const isSelected = selectedSport === sport;
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => onSelectSport(sport)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-charcoal text-white shadow-sm'
                        : 'bg-card text-charcoal/80 border border-edge hover:border-charcoal/30'
                    }`}
                  >
                    {sport}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-bold text-charcoal">Escolha a quadra</h2>
        <span className="text-xs text-muted">{courts.length} disponíveis</span>
      </div>
      <div className="-mx-4 px-4 overflow-x-auto no-scrollbar">
        <div className="flex gap-2.5 pb-1 w-max">
          {courts.map((c) => {
            const active = c.id === selectedId;
            const prices = (c.sportPricing || []).map(sp => sp.preco).filter(p => p > 0);
            const isMultiSport = (c.modalities && c.modalities.length > 1) && (new Set(prices).size > 1);
            const priceLabel = selectedSport === 'Todos' && isMultiSport
              ? 'Multi-esporte'
              : `${brl(c.pricePerHour)}/h`;

            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`tap flex flex-col items-start gap-1 rounded-2xl px-4 py-3 min-w-[150px] border transition-all active:scale-[0.98] ${
                  active
                    ? 'bg-charcoal text-white border-charcoal shadow-soft'
                    : 'bg-card text-charcoal border-edge'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{c.name}</span>
                </div>
                {c.surface && (
                  <span className={`text-xs ${active ? 'text-white/70' : 'text-muted'}`}>{c.surface}</span>
                )}
                {c.modalities && c.modalities.length > 0 && (
                  <span className={`text-[10px] truncate max-w-[130px] ${active ? 'text-white/60' : 'text-muted/80'}`}>
                    {c.modalities.join(' · ')}
                  </span>
                )}
                <span
                  className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    active ? 'bg-white/15 text-white' : 'bg-available-bg text-available-text'
                  }`}
                >
                  {priceLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
