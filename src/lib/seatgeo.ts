// Where a seat is in the hall, and what the view from it is like. Shared by server and client code.
import type { Layout } from './types';
import { rowLetter, seatNum } from './layout';

export function seatGeo(layout: Layout, id: string) {
  const row = layout.find(r => r.r === rowLetter(id)) ?? layout[0];
  const ri = layout.indexOf(row), n = seatNum(id);
  const b0 = layout.findIndex(r => r.cls === 'balcony');
  return { ri, f: ((n - .5) / row.n) * 2 - 1, bal: row.cls === 'balcony', cls: row.cls, n, S: row.n, bal0: b0 < 0 ? layout.length : b0 };
}

export function comfort(layout: Layout, id: string) {
  const g = seatGeo(layout, id), t: string[] = [], half = Math.ceil(g.S / 2);
  if (g.bal) t.push(g.ri === g.bal0 ? 'Raised view, nobody in front' : 'Raised view');
  else if (g.ri <= 1) t.push('Very close, you look up');
  else if (g.ri <= 4) t.push('Screen fills your view');
  else t.push('Best balance of size and comfort');
  if (Math.abs(g.f) > .7) t.push('Angled view'); else if (Math.abs(g.f) < .3) t.push('Centred');
  if ([1, g.S, half, half + 1].includes(g.n)) t.push('Aisle seat');
  return t;
}
