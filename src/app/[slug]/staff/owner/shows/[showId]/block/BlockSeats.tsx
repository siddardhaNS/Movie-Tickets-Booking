'use client';

import { useState, useTransition } from 'react';
import type { Layout, Prices, SeatClass, SeatState } from '@/lib/types';
import { SeatMap, Legend } from '@/components/SeatMap';
import { finishBlocking, toggleBlockAction } from '../../../actions';

export function BlockSeats(p: {
  slug: string; showId: string; title: string; sub: string; layout: Layout; classes: SeatClass[]; prices: Prices;
  initialStates: Record<string, SeatState>; initialReasons: Record<string, string>;
}) {
  const [states, setStates] = useState(p.initialStates);
  const [reasons, setReasons] = useState(p.initialReasons);
  const [reason, setReason] = useState('House quota');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const n = Object.values(states).filter(s => s === 'blocked').length;

  const onSeat = (id: string) => start(async () => {
    const r = await toggleBlockAction(p.slug, p.showId, id, reason);
    if ('error' in r && r.error) { setErr(r.error); return; }
    setErr('');
    const blocked = r.status === 'blocked';
    setStates(s => ({ ...s, [id]: blocked ? 'blocked' : 'available' }));
    setReasons(x => { const y = { ...x }; if (blocked) y[id] = reason; else delete y[id]; return y; });
  });

  return (
    <>
      <div className="ohead">
        <div><p className="eyebrow">Block seats</p><h1>{p.title}</h1><p className="mmeta">{p.sub}</p></div>
        <form action={finishBlocking.bind(null, p.slug, p.showId, n)}><button className="btn primary" type="submit">Done</button></form>
      </div>
      {err ? <div className="banner" role="alert">{err}</div> : null}
      <section className="card hcard">
        <div className="blockhead">
          <label className="f" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>Reason for new blocks
            <select className="inp" value={reason} onChange={e => setReason(e.target.value)} style={{ width: 'auto', padding: '8px 12px' }}>
              {['House quota', 'Guests', 'Press', 'Repair'].map(r => <option key={r}>{r}</option>)}
            </select></label>
          <span className="pill acc">{n} seats blocked{pending ? ' · saving…' : ''}</span>
        </div>
        <div style={{ padding: '14px 0' }}>
          <Legend />
          <SeatMap layout={p.layout} classes={p.classes} prices={p.prices} states={states} reasons={reasons} mode="block" onSeat={onSeat} />
        </div>
        <p className="note" style={{ padding: '0 16px 16px' }}>Tap a seat to block or unblock it. Each tap is saved straight away. Booked seats can&apos;t be blocked. Hover a blocked seat to see why.</p>
      </section>
    </>
  );
}
