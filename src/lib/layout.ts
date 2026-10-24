import type { Layout, LayoutRow, OrgSettings } from './types';

export const seatsInRow = (row: LayoutRow) =>
  Array.from({ length: row.n }, (_, i) => i + 1).filter(n => !row.off.includes(n)).map(n => row.r + n);

export const allSeats = (layout: Layout) => layout.flatMap(seatsInRow);

export const rowLetter = (seatId: string) => seatId.match(/^[A-Z]+/)![0];
export const seatNum = (seatId: string) => Number(seatId.slice(rowLetter(seatId).length));

export function seatClass(layout: Layout, seatId: string): string | undefined {
  return layout.find(r => r.r === rowLetter(seatId))?.cls;
}

export function sortSeats(layout: Layout, ids: string[]): string[] {
  const order = new Map(layout.map((r, i) => [r.r, i]));
  return [...ids].sort((a, b) => (order.get(rowLetter(a))! - order.get(rowLetter(b))!) || seatNum(a) - seatNum(b));
}

export function defaultLayout(): Layout {
  const rows: Layout = [];
  ['A', 'B', 'C'].forEach(r => rows.push({ r, cls: 'second', n: 16, off: [] }));
  ['D', 'E', 'F', 'G', 'H', 'J'].forEach(r => rows.push({ r, cls: 'first', n: 18, off: [] }));
  ['K', 'L', 'M'].forEach(r => rows.push({ r, cls: 'balcony', n: 14, off: [] }));
  return rows;
}

export function defaultSettings(codePrefix: string): OrgSettings {
  return {
    codePrefix,
    slots: [
      { key: 'morning', label: 'Morning show', time: '11:00' },
      { key: 'matinee', label: 'Matinee', time: '14:30' },
      { key: 'first', label: 'First show', time: '18:15' },
      { key: 'second', label: 'Second show', time: '21:30' },
    ],
    classes: [
      { key: 'second', name: 'Second class', defaultPricePaise: 11000 },
      { key: 'first', name: 'First class', defaultPricePaise: 15000 },
      { key: 'balcony', name: 'Balcony', defaultPricePaise: 20000 },
    ],
    bookingFeePaise: 2000,
    gstRate: 0.18,
    maxSeats: 10,
    holdMinutes: 8,
    counterHoldMinutes: 3,
    defaultBlocked: {},
  };
}

/** Parse "F12" or "F3-6" typed at the box office into seat ids. */
export function parseSeatInput(raw: string, max: number): string[] | null {
  const m = raw.trim().toUpperCase().match(/^([A-Z]+)\s*(\d+)(?:\s*-\s*(\d+))?$/);
  if (!m) return null;
  const a = Number(m[2]), b = Number(m[3] ?? m[2]), ids: string[] = [];
  for (let n = Math.min(a, b); n <= Math.max(a, b) && ids.length < max; n++) ids.push(m[1] + n);
  return ids;
}
