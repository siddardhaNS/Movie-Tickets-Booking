'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Layout, Prices, SeatClass, SeatState } from '@/lib/types';
import { parseSeatInput, seatClass, sortSeats } from '@/lib/layout';
import { dayWord, fmtDate, fmtTime, initials, inr, mmss, PAY_LABEL } from '@/lib/format';
import { SeatMap, Legend } from '@/components/SeatMap';
import { ClientQR } from '@/components/ClientQR';

type Show = { id: string; date: string; time: string; slotLabel: string; title: string; prices: Prices; sold: number; sellable: number };
type Cart = { bookingId: string; seats: string[]; expiresAt: number; ticketsPaise: number };
type Receipt = { code: string; seats: string[]; total: number; pay: string; show: Show; at: number };

export function Counter(p: {
  slug: string; orgName: string; orgAddress: string; today: string; me: { name: string };
  shows: Show[]; layout: Layout; classes: SeatClass[]; maxSeats: number;
  stats: { sales: number; count: number; cash: number; upi: number };
}) {
  const router = useRouter();
  const [showId, setShowId] = useState(p.shows[0]?.id ?? '');
  const show = p.shows.find(s => s.id === showId);
  const [states, setStates] = useState<Record<string, SeatState>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<Cart | null>(null);
  const [pay, setPay] = useState<'cash' | 'upi'>('cash');
  const [recv, setRecv] = useState('');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [closing, setClosing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const keyRef = useRef<HTMLInputElement>(null);
  const api = `/api/t/${p.slug}`;

  const refresh = useCallback(async () => {
    if (!showId) return;
    const r = await fetch(`${api}/shows/${showId}/seats${cart ? `?hold=${cart.bookingId}` : ''}`, { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json(); setStates(d.states); setReasons(d.reasons);
  }, [api, showId, cart]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);

  // Hold countdown; when it runs out the server has already put the seats back on sale.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (cart && now > cart.expiresAt) { setCart(null); setErr('The hold ran out, so the seats went back on sale.'); refresh(); }
  }, [now, cart, refresh]);

  async function call(url: string, method: string, body?: unknown) {
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { router.refresh(); }
    return { ok: r.ok, d };
  }

  const applyHold = (d: { bookingId: string; seats: string[]; expiresAt: string; ticketsPaise: number }) =>
    setCart({ bookingId: d.bookingId, seats: sortSeats(p.layout, d.seats), expiresAt: new Date(d.expiresAt).getTime(), ticketsPaise: d.ticketsPaise });

  async function add(ids: string[]) {
    if (!show || busy) return;
    setBusy(true); setErr('');
    try {
      const fresh = ids.filter(x => !cart?.seats.includes(x));
      if (!fresh.length) return;
      const { ok, d } = cart
        ? await call(`${api}/holds/${cart.bookingId}`, 'PATCH', { showId, add: fresh })
        : await call(`${api}/holds`, 'POST', { showId, seats: fresh, channel: 'counter' });
      if (!ok) { setErr(d.error ?? 'Could not hold those seats.'); if (d.code === 'HOLD_EXPIRED') setCart(null); }
      else applyHold(d);
      await refresh();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!cart || busy) return;
    setBusy(true); setErr('');
    try {
      const { ok, d } = await call(`${api}/holds/${cart.bookingId}`, 'PATCH', { showId, remove: [id] });
      if (!ok) setErr(d.error ?? 'Could not remove that seat.');
      else if (d.released) setCart(null);
      else applyHold(d);
      await refresh();
    } finally { setBusy(false); }
  }

  async function clear() {
    if (cart) await call(`${api}/holds/${cart.bookingId}`, 'DELETE');
    setCart(null); setErr(''); setRecv(''); setRef(''); refresh();
  }

  async function confirm() {
    if (!cart || !show) return;
    const total = cart.ticketsPaise;
    if (pay === 'cash' && recv && Number(recv) * 100 < total) return setErr(`Cash received is ${inr(total - Number(recv) * 100)} short of the total.`);
    if (pay === 'upi' && !/^\d{4,12}$/.test(ref)) return setErr("Enter the last 4 digits of the UPI reference from the customer's phone.");
    setBusy(true); setErr('');
    try {
      const { ok, d } = await call(`${api}/counter/confirm`, 'POST', { bookingId: cart.bookingId, pay, ref: pay === 'upi' ? ref : undefined });
      if (!ok) { setErr(d.error ?? 'Could not confirm the sale.'); if (d.code === 'HOLD_EXPIRED') setCart(null); return; }
      setReceipt({ code: d.code, seats: cart.seats, total, pay, show, at: Date.now() });
      setCart(null); setRecv(''); setRef('');
      router.refresh(); refresh();
    } finally { setBusy(false); }
  }

  async function pickShow(id: string) {
    if (id === showId) return;
    if (cart) await clear();
    setShowId(id); setStates({});
  }

  const onSeat = (id: string) => (cart?.seats.includes(id) ? remove(id) : add([id]));
  const clsName = (k: string) => p.classes.find(c => c.key === k)?.name ?? k;
  const change = (Number(recv) || 0) * 100 - (cart?.ticketsPaise ?? 0);
  const free = Object.values(states).filter(s => s === 'available').length;

  const strip = (
    <section className="card k-strip">
      <div className="who"><span className="avatar">{initials(p.me.name)}</span>
        <div><b>{p.me.name} · Box office</b><span>{dayWord(p.today, p.today)}, {fmtDate(p.today)}</span></div></div>
      <div className="kstat"><small>Tickets sold</small><b>{p.stats.count}</b></div>
      <div className="kstat"><small>Cash</small><b>{inr(p.stats.cash)}</b></div>
      <div className="kstat"><small>UPI</small><b>{inr(p.stats.upi)}</b></div>
      <button className="btn" onClick={() => setClosing(true)}>Close shift</button>
    </section>
  );

  if (!show) return <>{strip}<div className="empty"><b>No more shows to sell today or tomorrow</b>New shows appear here once the manager schedules them.</div></>;

  return (
    <>
      {strip}
      <div className="counter">
        <aside className="card k-shows" aria-label="Shows"><h3>Shows</h3>
          {p.shows.map(x => (
            <button key={x.id} className="kshow" aria-pressed={x.id === showId} onClick={() => pickShow(x.id)}>
              <b>{fmtTime(x.time)} · {dayWord(x.date, p.today)}</b><span>{x.title}</span>
              <div className="bar"><i style={{ width: `${Math.round(x.sold / Math.max(1, x.sellable) * 100)}%` }} /></div>
              <span className="num">{x.sellable - x.sold} seats left</span>
            </button>
          ))}
        </aside>
        <section className="card k-map" aria-label="Seat map">
          <div className="k-head">
            <div><h2>{show.title}</h2><span>{dayWord(show.date, p.today)} · {fmtTime(show.time)} · {show.slotLabel} · {free} left</span></div>
            <form className="keyform" onSubmit={e => {
              e.preventDefault();
              const ids = parseSeatInput(keyRef.current?.value ?? '', p.maxSeats);
              if (!ids) { setErr('Type a seat like F12, or a range like F3-6.'); return; }
              add(ids); if (keyRef.current) { keyRef.current.value = ''; keyRef.current.focus(); }
            }}>
              <label className="sr" htmlFor="keyin">Type seats</label>
              <input ref={keyRef} className="inp" id="keyin" autoComplete="off" placeholder="F12 or F3-6" />
              <button className="btn" type="submit">Add</button>
            </form>
          </div>
          <Legend />
          <SeatMap layout={p.layout} classes={p.classes} prices={show.prices} states={states} reasons={reasons} selected={new Set(cart?.seats ?? [])} compact onSeat={onSeat} />
        </section>
        <aside className="card cart" aria-label="Current sale">
          <div className="hd" style={{ padding: 0, border: 0 }}><h3>Current sale</h3>
            {cart ? <span className="pill acc">Held <span className="mono">{mmss(cart.expiresAt - now)}</span></span> : null}</div>
          {err ? <div className="banner" role="alert">{err}</div> : null}
          {cart ? (
            <>
              <div className="chips">{cart.seats.map(x => <span key={x} className="schip">{x}<button onClick={() => remove(x)} aria-label={`Remove ${x}`}>×</button></span>)}</div>
              <div className="lines">
                {p.classes.map(c => ({ c, n: cart.seats.filter(x => seatClass(p.layout, x) === c.key).length })).filter(g => g.n).map(g => (
                  <div key={g.c.key}><span>{clsName(g.c.key)} × {g.n}</span><span className="num">{inr(g.n * (show.prices[g.c.key] ?? 0))}</span></div>
                ))}
                <div className="tot"><span>Total</span><span className="num">{inr(cart.ticketsPaise)}</span></div>
              </div>
              <div className="seg" role="group" aria-label="Payment">
                {(['cash', 'upi'] as const).map(v => <button key={v} type="button" aria-pressed={pay === v} onClick={() => setPay(v)}>{PAY_LABEL[v]}</button>)}
              </div>
              {pay === 'cash' ? (
                <>
                  <label className="f" htmlFor="krecv">Cash received<input className="inp num" id="krecv" inputMode="numeric" value={recv} onChange={e => setRecv(e.target.value.replace(/\D/g, ''))} placeholder={String(cart.ticketsPaise / 100)} /></label>
                  <div className="change"><span>Change to give</span><span className="num">{recv ? (change >= 0 ? inr(change) : `${inr(-change)} short`) : '—'}</span></div>
                </>
              ) : (
                <><label className="f" htmlFor="kref">UPI reference (last 4 digits)<input className="inp mono" id="kref" inputMode="numeric" maxLength={12} value={ref} onChange={e => setRef(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 4821" /></label>
                  <p className="note">Customer scans the theatre QR at the counter.</p></>
              )}
              <button className="btn primary lg wide" onClick={confirm} disabled={busy}>Confirm and print</button>
              <button className="btn wide" onClick={clear} disabled={busy}>Clear</button>
            </>
          ) : <div className="empty" style={{ padding: '24px 12px' }}><b>No seats yet</b>Tap seats on the map or type them, like F12 or F3-6.</div>}
        </aside>
      </div>

      {receipt ? (
        <div className="overlay"><div className="card modal" role="dialog" aria-label="Ticket printed">
          <h3>Ticket ready</h3>
          <div className="receipt">
            <div className="c big">{p.orgName.toUpperCase()}</div><div className="c">{p.orgAddress}</div><hr />
            <div className="big">{receipt.show.title.toUpperCase()}</div><div>{fmtDate(receipt.show.date)} · {fmtTime(receipt.show.time)}</div><div>{receipt.show.slotLabel}</div><hr />
            <div className="lr"><span>Seats</span><span>{receipt.seats.join(' ')}</span></div>
            <div className="lr"><span>Class</span><span>{[...new Set(receipt.seats.map(x => clsName(seatClass(p.layout, x) ?? '')))].join(', ')}</span></div>
            <div className="lr"><span>Paid</span><span>{inr(receipt.total)} {PAY_LABEL[receipt.pay]}</span></div>
            <div className="lr"><span>Booking</span><span>{receipt.code}</span></div>
            <ClientQR code={receipt.code} />
            <hr /><div className="c">{p.me.name} · {new Date(receipt.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div>
          </div>
          <button className="btn primary wide" onClick={() => window.print()}>Send to printer</button>
          <button className="btn wide" onClick={() => setReceipt(null)} autoFocus>Next customer</button>
        </div></div>
      ) : null}

      {closing ? (
        <div className="overlay"><div className="card modal" role="dialog" aria-label="Shift report">
          <h3>Close shift · {p.me.name}</h3>
          <div className="lines">
            <div><span>Tickets sold</span><b>{p.stats.count}</b></div><div><span>Sales</span><b>{p.stats.sales}</b></div>
            <div><span>Cash in drawer</span><b className="num">{inr(p.stats.cash)}</b></div><div><span>UPI received</span><b className="num">{inr(p.stats.upi)}</b></div>
            <div className="tot"><span>Total</span><span className="num">{inr(p.stats.cash + p.stats.upi)}</span></div>
          </div>
          <p className="note">Count the cash drawer. It should hold {inr(p.stats.cash)} plus the opening float.</p>
          <button className="btn primary wide" type="button" onClick={async () => {
            if (cart) await clear();
            await fetch(`/${p.slug}/staff/logout`, { method: 'POST' }).catch(() => null);
            router.push(`/${p.slug}/staff/login`); router.refresh();
          }}>Close shift and log out</button>
          <button className="btn wide" onClick={() => setClosing(false)}>Keep selling</button>
        </div></div>
      ) : null}
    </>
  );
}
