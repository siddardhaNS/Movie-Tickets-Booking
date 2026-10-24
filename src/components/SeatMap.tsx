'use client';

import type { Layout, Prices, SeatClass, SeatState } from '@/lib/types';
import { inr } from '@/lib/format';

type Props = {
  layout: Layout;
  classes: SeatClass[];
  prices: Prices;
  states: Record<string, SeatState>;
  reasons?: Record<string, string>;
  selected?: Set<string>;
  best?: Set<string>;
  compact?: boolean;
  /** 'block' lets blocked seats be clicked (to unblock them). */
  mode?: 'sell' | 'block';
  onSeat: (id: string) => void;
};

export function SeatMap({ layout, classes, prices, states, reasons = {}, selected = new Set(), best = new Set(), compact, mode = 'sell', onSeat }: Props) {
  const clsName = (k: string) => classes.find(c => c.key === k)?.name ?? k;
  let prev: string | null = null;
  return (
    <div className="mapwrap">
      <div className={`map${compact ? ' compact' : ''}`}>
        <div className="screen"><span>Screen this side</span></div>
        {layout.map(row => {
          const head = row.cls !== prev
            ? <div className="cls" key={`h-${row.r}`}><span>{clsName(row.cls)}</span><span className="num">{inr(prices[row.cls] ?? 0)}</span></div>
            : null;
          prev = row.cls;
          const half = Math.ceil(row.n / 2), cells = [];
          for (let n = 1; n <= row.n; n++) {
            if (n === half + 1) cells.push(<span className="aisle" key="aisle" />);
            if (row.off.includes(n)) { cells.push(<span className="seat-gap" key={n} />); continue; }
            const id = row.r + n, st = states[id] ?? 'taken', on = selected.has(id) || st === 'mine';
            let cls = 'seat', dis = false, label = `Seat ${id}`;
            if (st === 'taken') { cls += ' sold'; dis = true; label += ', booked'; }
            else if (st === 'blocked') { cls += ' blk'; label += `, not for sale (${reasons[id] ?? 'blocked'})`; if (mode !== 'block') dis = true; }
            if (on) cls += ' sel';
            if (best.has(id) && !on) cls += ' best';
            cells.push(
              <button key={n} className={cls} data-seat={id} disabled={dis} aria-pressed={on} aria-label={label}
                title={st === 'blocked' ? reasons[id] ?? 'Blocked' : id} onClick={() => onSeat(id)}>{n}</button>,
            );
          }
          return [head, <div className="srow" key={row.r}><span className="rl">{row.r}</span>{cells}<span className="rl">{row.r}</span></div>];
        })}
      </div>
    </div>
  );
}

export function Legend({ best }: { best?: boolean }) {
  return (
    <div className="legend">
      <span><i className="lg-a" />Available</span><span><i className="lg-s" />Selected</span>
      <span><i className="lg-x" />Booked</span><span><i className="lg-k" />Not for sale</span>
      {best ? <span><i className="lg-b" />Best for you</span> : null}
    </div>
  );
}

/** Best blocks of `size` adjacent free seats, not crossing the aisle, one suggestion per row. */
export function bestBlocks(layout: Layout, states: Record<string, SeatState>, prices: Prices, size: number) {
  const out: { ids: string[]; score: number; price: number; cls: string }[] = [], ideal = layout.length * .62;
  layout.forEach((row, ri) => {
    const S = row.n, half = Math.ceil(S / 2);
    for (let st = 1; st + size - 1 <= S; st++) {
      const en = st + size - 1;
      if (st <= half && en > half) continue;
      const ids = Array.from({ length: size }, (_, i) => row.r + (st + i));
      if (ids.some((x, i) => states[x] !== 'available' || row.off.includes(st + i))) continue;
      const centre = Math.abs((st + en) / 2 - (S + 1) / 2) / (S / 2);
      out.push({ ids, score: Math.abs(ri - ideal) + centre * 5, price: ids.length * (prices[row.cls] ?? 0), cls: row.cls });
    }
  });
  out.sort((a, b) => a.score - b.score);
  const pick: typeof out = [], rows = new Set<string>();
  for (const o of out) { const r = o.ids[0].match(/^[A-Z]+/)![0]; if (rows.has(r)) continue; pick.push(o); rows.add(r); if (pick.length === 3) break; }
  return pick;
}
