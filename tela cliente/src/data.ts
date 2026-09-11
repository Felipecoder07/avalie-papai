import type { ArenaInfo, Court, Slot } from './types';

export const arena: ArenaInfo = {
  name: 'Arena Beach Club',
  cover:
    'https://images.pexels.com/photos/2485479/pexels-photo-2485479.jpeg?auto=compress&cs=tinysrgb&w=1400',
  address: 'Av. Beira Mar, 1200 · Praia de Iracema, Fortaleza/CE',
  whatsapp: '+55 85 99123-4567',
  hoursToday: 'Aberto hoje das 07h às 23h',
  rating: 4.9,
  reviews: 327,
};

export const courts: Court[] = [
  { id: 'c1', name: 'Quadra 1', type: 'areia', pricePerHour: 100, surface: 'Areia' },
  { id: 'c2', name: 'Quadra 2', type: 'coberta', pricePerHour: 120, surface: 'Coberta' },
  { id: 'c3', name: 'Quadra 3', type: 'society', pricePerHour: 160, surface: 'Society' },
  { id: 'c4', name: 'Quadra 4', type: 'areia', pricePerHour: 90, surface: 'Areia' },
];

const pad = (n: number) => String(n).padStart(2, '0');

export function buildDates(count = 14): { iso: string; label: string; sub: string; weekday: string }[] {
  const out: { iso: string; label: string; sub: string; weekday: string }[] = [];
  const today = new Date();
  const wd = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    out.push({
      iso,
      label: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : wd[d.getDay()],
      sub: `${wd[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
      weekday: wd[d.getDay()],
    });
  }
  return out;
}

export const dates = buildDates(14);

const morning = ['07:00', '08:00', '09:00', '10:00', '11:00'];
const afternoon = ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
const night = ['18:00', '19:00', '20:00', '21:00', '22:00'];

function buildSlots(courtId: string, price: number, dateISO: string, busyPattern: number[]): Slot[] {
  const mk = (start: string, block: Slot['block'], idx: number): Slot => {
    const [h] = start.split(':').map(Number);
    const end = `${pad(h + 1)}:00`;
    return {
      id: `${courtId}-${dateISO}-${start}`,
      courtId,
      dateISO,
      start,
      end,
      price,
      status: busyPattern.includes(idx) ? 'busy' : 'free',
      block,
    };
  };
  return [
    ...morning.map((s, i) => mk(s, 'manha', i)),
    ...afternoon.map((s, i) => mk(s, 'tarde', i + 10)),
    ...night.map((s, i) => mk(s, 'noite', i + 20)),
  ];
}

const busyByCourt: Record<string, number[]> = {
  c1: [0, 3, 11, 18, 21],
  c2: [1, 2, 12, 13, 19],
  c3: [4, 5, 14, 20, 22],
  c4: [0, 6, 9, 15, 23],
};

export function getSlotsForCourtAndDate(courtId: string, dateISO: string): Slot[] {
  const court = courts.find((c) => c.id === courtId)!;
  const seed = dateISO.split('-').reduce((a, b) => a + Number.parseInt(b), 0);
  const pattern = busyByCourt[courtId] ?? [];
  const shifted = pattern.map((p) => (p + seed) % 24);
  return buildSlots(courtId, court.pricePerHour, dateISO, shifted);
}
