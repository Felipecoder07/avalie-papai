import { getLocalDateISO } from '../lib/format';

interface DateItem {
  iso: string;
  label: string;
  sub: string;
  weekday: string;
}

interface Props {
  dates?: DateItem[];
  selectedISO: string;
  onSelect: (iso: string) => void;
}

function getNext7Days(): DateItem[] {
  const list: DateItem[] = [];
  const hoje = new Date();
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    const iso = getLocalDateISO(d);
    const diaNum = d.getDate();
    const mesNum = d.getMonth() + 1;
    const diaSem = i === 0 ? 'Hoje' : diasSemana[d.getDay()];

    list.push({
      iso,
      label: diaSem,
      sub: `${diaNum}/${mesNum}`,
      weekday: diasSemana[d.getDay()]
    });
  }
  return list;
}

export default function DateCarousel({ dates, selectedISO, onSelect }: Readonly<Props>) {
  const datesList = dates && dates.length > 0 ? dates : getNext7Days();

  return (
    <section className="px-4 pt-5">
      <h2 className="text-base font-bold text-charcoal mb-3">Escolha a data</h2>
      <div className="-mx-4 px-4 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 pb-1 w-max">
          {datesList.map((d) => {
            const active = d.iso === selectedISO;
            return (
              <button
                key={d.iso}
                onClick={() => onSelect(d.iso)}
                className={`tap flex flex-col items-center justify-center rounded-2xl px-3 py-2 min-w-[84px] border transition-all active:scale-[0.97] ${
                  active
                    ? 'bg-charcoal text-white border-charcoal'
                    : 'bg-card text-charcoal border-edge'
                }`}
              >
                <span className={`text-[11px] font-semibold uppercase ${active ? 'text-white/70' : 'text-muted'}`}>
                  {d.label}
                </span>
                <span className="text-sm font-bold mt-0.5">{d.sub}</span>
                <span className={`text-[11px] ${active ? 'text-white/60' : 'text-muted'}`}>{d.weekday}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
