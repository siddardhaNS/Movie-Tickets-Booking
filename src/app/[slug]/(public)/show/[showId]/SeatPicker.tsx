'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Layout, Prices, SeatClass, SeatState } from '@/lib/types';
import { allSeats, seatClass, sortSeats } from '@/lib/layout';
import { dayWord, fmtDate, fmtTime, inr } from '@/lib/format';
import { SeatMap, Legend, bestBlocks } from '@/components/SeatMap';
import { SeatView } from '@/components/SeatView';
import { comfort, seatGeo } from '@/lib/seatgeo';

type Props = {
  slug: string; today: string; showId: string;
  show: { date: string; slotLabel: string; time: string; prices: Prices; closed: boolean };
  movie: { title: string; cert: string; lang: string; hue: number };
  layout: Layout; classes: SeatClass[]; maxSeats: number;
  initialStates: Record<string, SeatState>; initialReasons: Record<string, string>;
};

export const Steps = ({ n }: { n: number }) => (
  <div className="steps" aria-label={`Step ${n} of 3`}>
    {['Seats', 'Pay', 'Ticket'].map((l, i) => (
      <span key={l} className={i + 1 === n ? 'on' : i + 1 < n ? 'done' : ''}>{i + 1 < n ? '✓ ' : ''}{i + 1} {l}</span>
    ))}
  </div>
);

export function SeatPicker(p: Props) {
  const router = useRouter();
  const [states, setStates] = useState(p.initialStates);
  const [sel, setSel] = useState<string[]>([]);
  const [party, setParty] = useState(2);
  const [preview, setPreview] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const clsName = (k: string) => p.classes.find(c => c.key === k)?.name ?? k;

  // Keep the map live: other people's bookings show up within a few seconds.
  const refresh = useCallback(async () => {
    const r = await fetch(`/api/t/${p.slug}/shows/${p.showId}/seats`, { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return;
    const data = await r.json() as { states: Record<string, SeatState> };
    setStates(data.states);
    setSel(cur => {
      const gone = cur.filter(x => data.states[x] !== 'available');
      if (gone.length) setErr(`${gone.join(', ')} just got booked by someone else.`);
      return cur.filter(x => data.states[x] === 'available');
    });
  }, [p.slug, p.showId]);
  useEffect(() => { const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);

  const best = useMemo(() => bestBlocks(p.layout, states, p.show.prices, party), [p.layout, states, p.show.prices, party]);
  const bestSet = useMemo(() => new Set(sel.length ? [] : best.flatMap(b => b.ids)), [best, sel.length]);
  const free = Object.values(states).filter(s => s === 'available').length;
  const sellable = Object.values(states).filter(s => s !== 'blocked').length;
  const shown = hover ?? preview ?? sel.at(-1) ?? best[0]?.ids[0] ?? allSeats(p.layout)[Math.floor(allSeats(p.layout).length * .6)];
  const g = seatGeo(p.layout, shown);
  const tix = sel.reduce((n, x) => n + (p.show.prices[seatClass(p.layout, x) ?? ''] ?? 0), 0);

  function toggle(id: string) {
    setErr('');
    if (sel.includes(id)) { setSel(sel.filter(x => x !== id)); return; }
    if (sel.length >= p.maxSeats) { setErr(`You can book up to ${p.maxSeats} seats at a time.`); return; }
    setSel(sortSeats(p.layout, [...sel, id])); setPreview(id);
  }

  async function proceed() {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/t/${p.slug}/holds`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ showId: p.showId, seats: sel, channel: 'online' }) });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? 'Could not hold those seats.');
        if (data.seats?.length) setSel(s => s.filter(x => !data.seats.includes(x)));
        await refresh();
        return;
      }
      router.push(`/${p.slug}/checkout/${data.bookingId}`);
    } finally { setBusy(false); }
  }

  const onPoint = (e: React.PointerEvent | React.FocusEvent) => {
    const t = (e.target as HTMLElement).closest?.('[data-seat]:not(:disabled)') as HTMLElement | null;
    setHover(t ? t.dataset.seat! : null);
  };

  return (
    <>
      <div className="crumbs">
        <Link className="btn sm" href={`/${p.slug}`}>← All shows</Link>
        <div className="ttl"><h2>{p.movie.title}</h2><span>{dayWord(p.show.date, p.today)}, {fmtDate(p.show.date)} · {fmtTime(p.show.time)} · {p.show.slotLabel}</span></div>
        <Steps n={1} />
      </div>
      {p.show.closed ? <div className="banner" style={{ marginBottom: 14 }}>This show is no longer taking bookings.</div> : null}
      {err ? <div className="banner" role="alert" style={{ marginBottom: 14 }}>{err}</div> : null}
      <div className="seatlay">
        <aside className="seat-aside">
          <section className="card viewcard" aria-label="View from seat">
            <SeatView layout={p.layout} seatId={shown} movie={p.movie} seed={p.showId} label="Drawing of the screen as seen from the chosen seat" />
            <div className="vinfo" aria-live="polite">
              <p className="eyebrow">View from your seat</p>
              <div className="where">Row {shown.match(/^[A-Z]+/)![0]} · Seat {g.n}</div>
              <span className="mmeta">{clsName(g.cls)} · {inr(p.show.prices[g.cls] ?? 0)} · {g.bal ? `balcony row ${g.ri - g.bal0 + 1}` : `${g.ri + 1}${['st', 'nd', 'rd'][g.ri] ?? 'th'} row from the screen`}</span>
              <div className="tags">{comfort(p.layout, shown).map(t => <span key={t} className="pill">{t}</span>)}</div>
            </div>
            <p className="note" style={{ padding: '0 4px 2px' }}>Hover or tap any seat to see the screen from there.</p>
          </section>
          <section className="card bestbar" aria-label="Best seats">
            <div className="bb-head"><h3>Best seats left</h3>
              <div className="stepper"><span>Seats for</span>
                <button onClick={() => setParty(Math.max(1, party - 1))} aria-label="Fewer people">−</button><b className="num">{party}</b>
                <button onClick={() => setParty(Math.min(6, party + 1))} aria-label="More people">+</button></div></div>
            {best.length ? (
              <div className="opts">
                {best.map((b, i) => (
                  <button key={b.ids.join()} className={`opt${i === 0 ? ' first' : ''}`} onPointerEnter={() => setHover(b.ids[0])} onPointerLeave={() => setHover(null)}
                    onClick={() => { setSel(b.ids); setPreview(b.ids[0]); setErr(''); }}>
                    <div style={{ minWidth: 0 }}><b className="mono">{b.ids.length > 1 ? `${b.ids[0]}–${b.ids.at(-1)!.replace(/^[A-Z]+/, '')}` : b.ids[0]}</b><span>{clsName(b.cls)} · {inr(b.price)}</span></div>
                    <span className="go">{i === 0 ? 'Best pick · ' : ''}Take these</span>
                  </button>
                ))}
              </div>
            ) : <p className="note">No {party} seats together are left. Try fewer seats.</p>}
          </section>
        </aside>
        <section className="card mapcard" aria-label="Seat map" onPointerOver={onPoint} onPointerLeave={() => setHover(null)} onFocus={onPoint}>
          <Legend best={!sel.length} />
          <SeatMap layout={p.layout} classes={p.classes} prices={p.show.prices} states={states} selected={new Set(sel)} best={bestSet} onSeat={toggle} />
          <p className="note" style={{ textAlign: 'center', marginTop: 10 }}>{free} of {sellable} seats left · up to {p.maxSeats} per booking</p>
        </section>
      </div>
      <div className="actionbar">
        <div className="info">
          {sel.length
            ? <><b className="num">{sel.length} seat{sel.length > 1 ? 's' : ''} · {inr(tix)}</b><span className="mono">{sel.join(', ')}</span></>
            : <><b>Pick your seats</b><span>Tap seats on the map, or take a best pick</span></>}
        </div>
        <button className="btn primary lg" onClick={proceed} disabled={!sel.length || busy || p.show.closed}>{busy ? 'Holding seats…' : 'Continue to pay'}</button>
      </div>
    </>
  );
}
