import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CAN, requireStaff } from '@/lib/auth';
import { orgOr404 } from '@/lib/tenant';
import { bookingsForShowsBetween, moviesOf, refundsBetween, showsBetween, staffOf } from '@/lib/queries';
import { addDaysKey, dateKeyIn, fmtDate, inr, inr2, PAY_LABEL, weekdayShort, when, zonedToUtc } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Reports({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ range?: string }> }) {
  const org = await orgOr404((await params).slug);
  await requireStaff(org.id, org.slug, CAN.ownerOnly);
  const days = (await searchParams).range === '1' ? 1 : 7;
  const today = dateKeyIn(org.timezone), from = addDaysKey(today, 1 - days), base = `/${org.slug}/staff/owner/reports`;
  const keys = Array.from({ length: days }, (_, i) => addDaysKey(from, i));
  const [shows, rows, movies, staff, refunds] = await Promise.all([
    showsBetween(org.id, from, today), bookingsForShowsBetween(org.id, from, today), moviesOf(org.id), staffOf(org.id),
    refundsBetween(org.id, zonedToUtc(from, '00:00', org.timezone)),
  ]);
  const open = shows.filter(s => s.status === 'open');
  const bs = rows.map(r => r.booking);
  const seatsSold = bs.reduce((n, b) => n + b.seats.length, 0), coll = bs.reduce((n, b) => n + b.ticketsPaise, 0), fees = bs.reduce((n, b) => n + b.feesPaise, 0);
  const sellable = open.reduce((n, s) => n + s.sellable, 0);
  const perDay = keys.map(k => ({ k, v: rows.filter(r => r.date === k).reduce((n, r) => n + r.booking.ticketsPaise, 0) }));
  const maxV = Math.max(100, ...perDay.map(d => d.v)), step = [500000, 1000000, 2000000, 5000000, 10000000].find(s => maxV / s <= 5) ?? 20000000, top = Math.ceil(maxV / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const hb = (list: [string, typeof bs][], total: number) => (
    <div className="hbars">{list.map(([l, arr]) => {
      const v = arr.reduce((n, b) => n + b.ticketsPaise, 0);
      return <div className="hb" key={l}><span>{l}</span><span className="tr"><i style={{ width: `${total ? v / total * 100 : 0}%` }} /></span><span className="v">{inr(v)} <small>{total ? Math.round(v / total * 100) : 0}%</small></span></div>;
    })}</div>
  );
  const byMovie = movies.map(m => {
    const ss = open.filter(s => s.movieId === m.id), b2 = rows.filter(r => r.movieId === m.id).map(r => r.booking);
    return { m, n: ss.length, t: b2.reduce((n, b) => n + b.seats.length, 0), c: b2.reduce((n, b) => n + b.ticketsPaise, 0), occ: ss.length ? ss.reduce((n, s) => n + s.sold, 0) / Math.max(1, ss.reduce((n, s) => n + s.sellable, 0)) : 0 };
  }).filter(x => x.n).sort((a, b) => b.c - a.c);
  const shifts = staff.filter(s => s.role === 'boxoffice' || bs.some(b => b.staffId === s.id)).map(s => {
    const l = bs.filter(b => b.staffId === s.id);
    return { s, t: l.reduce((n, b) => n + b.seats.length, 0), cash: l.filter(b => b.payMethod === 'cash').reduce((n, b) => n + b.ticketsPaise, 0), upi: l.filter(b => b.payMethod === 'upi').reduce((n, b) => n + b.ticketsPaise, 0) };
  });
  const csv = 'Date,Tickets sold,Collection (INR)\n' + keys.map(k => { const b2 = rows.filter(r => r.date === k); return `${k},${b2.reduce((n, r) => n + r.booking.seats.length, 0)},${b2.reduce((n, r) => n + r.booking.ticketsPaise, 0) / 100}`; }).join('\n');

  return (
    <>
      <div className="ohead"><div><p className="eyebrow">{days === 1 ? fmtDate(today) : `${fmtDate(from)} to ${fmtDate(today)}`}</p><h1>Reports</h1></div>
        <div className="seg" role="group" aria-label="Period">
          {[['1', 'Today'], ['7', 'Last 7 days']].map(([v, l]) => <Link key={v} href={`${base}?range=${v}`} aria-current={String(days) === v ? 'page' : undefined} className="btn sm" style={String(days) === v ? { background: 'var(--surface)', boxShadow: 'var(--shadow)', border: 0 } : { background: 'none', border: 0 }}>{l}</Link>)}
        </div></div>
      <div className="kpis">
        <div className="card kpi"><small>Ticket collection</small><b>{inr(coll)}</b><span>{open.length} shows</span></div>
        <div className="card kpi"><small>Tickets sold</small><b>{seatsSold}</b><span>{bs.length} bookings</span></div>
        <div className="card kpi"><small>Seats filled</small><b>{Math.round(seatsSold / Math.max(1, sellable) * 100)}%</b><span>average per show</span></div>
        <div className="card kpi"><small>Booking fees</small><b>{inr(fees)}</b><span>{inr2(Math.round(fees * org.settings.gstRate / (1 + org.settings.gstRate)))} of it is GST</span></div>
      </div>
      <div className="rgrid">
        {days > 1 ? (
          <section className="card rcard span2">
            <div className="hd"><h3>Ticket collection by day</h3>
              <a className="btn sm" download={`collection-${from}-to-${today}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}>Download CSV</a></div>
            <div className="vchart" role="img" aria-label="Bar chart of ticket collection for each day">
              {ticks.map(v => <div className="gl" key={v} style={{ bottom: `calc(26px + ${(v / top) * (230 - 36)}px)` }}><span>{v >= 100000 ? `₹${v / 100000}k` : '₹0'}</span></div>)}
              {perDay.map((d, i) => (
                <button className="vbar" key={d.k} style={{ '--h': `${d.v / top * 100}%` } as CSSProperties} aria-label={`${fmtDate(d.k)}: ${inr(d.v)}`}><i />
                  {d.v === Math.max(...perDay.map(x => x.v)) || i === perDay.length - 1 ? <span className="lab num">{inr(d.v)}</span> : null}
                  <span className="tip">{inr(d.v)}<small>{fmtDate(d.k)}</small></span>
                  <span className={`x${d.k === today ? ' today' : ''}`}>{d.k === today ? 'Today' : `${weekdayShort(d.k)} ${Number(d.k.slice(8))}`}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <section className="card rcard"><div className="hd"><h3>Where tickets were sold</h3></div>
          {hb([['Online', bs.filter(b => b.channel === 'online')], ['Box office', bs.filter(b => b.channel === 'counter')]], coll)}</section>
        <section className="card rcard"><div className="hd"><h3>How people paid</h3></div>
          {hb(['upi', 'card', 'nb', 'cash'].map(p => [PAY_LABEL[p], bs.filter(b => b.payMethod === p)]), coll)}</section>
        <section className="card rcard"><div className="hd"><h3>Seats filled by show time</h3></div>
          <div className="hbars">{org.settings.slots.map(sl => {
            const ss = open.filter(s => s.slot === sl.key), v = ss.reduce((n, s) => n + s.sold, 0) / Math.max(1, ss.reduce((n, s) => n + s.sellable, 0));
            return <div className="hb" key={sl.key}><span>{sl.label}</span><span className="tr"><i style={{ width: `${v * 100}%` }} /></span><span className="v">{Math.round(v * 100)}%</span></div>;
          })}</div></section>
        <section className="card rcard"><div className="hd"><h3>Box office shifts</h3></div>
          <div className="tablewrap"><table className="t"><thead><tr><th>Staff</th><th className="r">Tickets</th><th className="r">Cash</th><th className="r">UPI</th></tr></thead>
            <tbody>{shifts.map(x => <tr key={x.s.id}><td>{x.s.name}</td><td className="r num">{x.t}</td><td className="r num">{inr(x.cash)}</td><td className="r num">{inr(x.upi)}</td></tr>)}</tbody></table></div></section>
        <section className="card rcard span2"><div className="hd"><h3>By movie</h3></div>
          <div className="tablewrap"><table className="t"><thead><tr><th>Movie</th><th className="r">Shows</th><th className="r">Tickets</th><th className="r">Seats filled</th><th className="r">Collection</th></tr></thead>
            <tbody>{byMovie.map(x => <tr key={x.m.id}><td><b>{x.m.title}</b><span className="sub">{x.m.lang}</span></td><td className="r num">{x.n}</td><td className="r num">{x.t}</td><td className="r num">{Math.round(x.occ * 100)}%</td><td className="r num"><b>{inr(x.c)}</b></td></tr>)}</tbody></table></div></section>
        <section className="card rcard span2"><div className="hd"><h3>Refunds</h3><span className="note">{refunds.length} in this period</span></div>
          {refunds.length ? (
            <div className="tablewrap"><table className="t"><thead><tr><th>Booking</th><th>Reason</th><th>When</th><th className="r">Amount</th></tr></thead>
              <tbody>{refunds.map(b => <tr key={b.id}><td className="mono">{b.code}</td><td>{b.refundReason}</td><td>{when(b.refundedAt!, org.timezone, today)}</td><td className="r num">{inr2(b.ticketsPaise + b.feesPaise)}</td></tr>)}</tbody></table></div>
          ) : <p className="note">No refunds.</p>}</section>
      </div>
    </>
  );
}
