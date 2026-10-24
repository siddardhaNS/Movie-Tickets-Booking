import Link from 'next/link';
import { CAN, requireStaff } from '@/lib/auth';
import { orgOr404 } from '@/lib/tenant';
import { bookingsForShowsBetween, moviesOf, paymentsNeedingRefund, showsBetween, soldByClass } from '@/lib/queries';
import { addDaysKey, dateKeyIn, fmtDate, fmtTime, inr, inr2, mask, when } from '@/lib/format';
import { sweepExpired } from '@/lib/booking';
import { getDb } from '@/db';
import { refundOrphanAction } from './actions';
import { Flash } from './Flash';

export const dynamic = 'force-dynamic';

export default async function Today({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const org = await orgOr404((await params).slug);
  const me = await requireStaff(org.id, org.slug, CAN.manage);
  await sweepExpired(await getDb(), org.id);
  const t = dateKeyIn(org.timezone), yd = addDaysKey(t, -1), base = `/${org.slug}/staff/owner`;
  const [list, movies, bs, ybs, orphans, upcoming] = await Promise.all([
    showsBetween(org.id, t, t), moviesOf(org.id), bookingsForShowsBetween(org.id, t, t), bookingsForShowsBetween(org.id, yd, yd),
    paymentsNeedingRefund(org.id), showsBetween(org.id, t, addDaysKey(t, 6)),
  ]);
  const cls = await soldByClass(list.map(s => s.id));
  const title = (id: string) => movies.find(m => m.id === id)?.title ?? '';
  const slot = (k: string) => org.settings.slots.find(s => s.key === k)!;
  const open = list.filter(s => s.status === 'open');
  const sold = open.reduce((n, s) => n + s.sold, 0), seatsAll = open.reduce((n, s) => n + s.sellable, 0);
  const coll = bs.reduce((n, x) => n + x.booking.ticketsPaise, 0), ycoll = ybs.reduce((n, x) => n + x.booking.ticketsPaise, 0);
  const onl = bs.filter(x => x.booking.channel === 'online').reduce((n, x) => n + x.booking.seats.length, 0);
  const almostFull = upcoming.filter(s => s.status === 'open' && s.startsAt.getTime() > Date.now() && s.sold < s.sellable && 1 - s.sold / Math.max(1, s.sellable) < .15).slice(0, 3);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: org.timezone }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const isOwner = me.role === 'owner';

  return (
    <>
      <div className="ohead"><div><p className="eyebrow">{fmtDate(t)}</p><h1>{greeting}, {me.name.split(' ')[0]}</h1></div>
        {isOwner ? <Link className="btn" href={`${base}/reports`}>See reports</Link> : null}</div>
      <Flash />
      <div className="kpis">
        <div className="card kpi"><small>Ticket collection</small><b>{inr(coll)}</b><span>{ycoll ? `${coll >= ycoll ? 'Up' : 'Down'} ${Math.abs(Math.round((coll - ycoll) / ycoll * 100))}% on yesterday` : 'Today so far'}</span></div>
        <div className="card kpi"><small>Tickets sold</small><b>{sold}</b><span>across {open.length} shows</span></div>
        <div className="card kpi"><small>Seats filled</small><b>{seatsAll ? Math.round(sold / seatsAll * 100) : 0}%</b><span>{sold} of {seatsAll} seats</span></div>
        <div className="card kpi"><small>Sold online</small><b>{sold ? Math.round(onl / sold * 100) : 0}%</b><span>{sold - onl} at the box office</span></div>
      </div>
      <section className="card hcard">
        <div className="hd"><h3>Needs your attention</h3><span className="note">{orphans.length + almostFull.length || 'Nothing'} open</span></div>
        {orphans.map(({ payment: p, booking: b }) => (
          <div className="alert" key={p.id}><span className="dot bad" />
            <div><b>Payment needs checking · {inr2(p.amountPaise)}</b><span>{p.note} {b.name} {mask(b.phone)} · {when(p.createdAt, org.timezone, t)}</span></div>
            {isOwner ? <form action={refundOrphanAction.bind(null, org.slug, p.id)}><button className="btn sm" type="submit">Refund now</button></form> : null}
          </div>
        ))}
        {almostFull.map(s => (
          <div className="alert" key={s.id}><span className="dot warn" />
            <div><b>{title(s.movieId)} is almost full</b><span>{fmtDate(s.date)} {fmtTime(slot(s.slot).time)} · {s.sellable - s.sold} seats left</span></div>
            <Link className="btn sm" href={`${base}/shows?edit=${s.id}`}>Open</Link>
          </div>
        ))}
        {!orphans.length && !almostFull.length ? <div className="alert"><span className="dot ok" /><div><b>All clear</b><span>No payment problems and no shows close to full.</span></div></div> : null}
      </section>
      <div className="sec" style={{ margin: '8px 0 0' }}><h2>Today&apos;s shows</h2></div>
      {list.length ? (
        <div className="sgrid">
          {list.map(s => {
            const sl = slot(s.slot), started = s.startsAt.getTime() <= Date.now(), pct = Math.round(s.sold / Math.max(1, s.sellable) * 100), free = 1 - s.sold / Math.max(1, s.sellable);
            const pill = s.status === 'cancelled' ? <span className="pill bad">Cancelled</span>
              : started ? <span className="pill">{s.checkedIn} entered</span>
                : free <= 0 ? <span className="pill bad">Housefull</span>
                  : <span className={`pill ${free < .4 ? 'warn' : 'ok'}`}>{free < .15 ? 'Almost full' : free < .4 ? 'Fast filling' : 'Available'}</span>;
            const collected = bs.filter(x => x.booking.showId === s.id).reduce((n, x) => n + x.booking.ticketsPaise, 0);
            return (
              <article className="card scard" key={s.id}>
                <div className="scard-h"><div><h3>{fmtTime(sl.time)} · {sl.label}</h3><span>{title(s.movieId)}</span></div>{pill}</div>
                <div className="big">{pct}%<small>{s.sold} of {s.sellable} seats</small></div>
                <div className="cbars">
                  {org.settings.classes.map(c => {
                    const r = cls.find(x => x.show_id === s.id && x.cls === c.key);
                    return <div className="cbar" key={c.key}><span>{c.name}</span><span className="tr"><i style={{ width: `${r?.total ? r.sold / r.total * 100 : 0}%` }} /></span><span className="v">{r?.sold ?? 0}/{r?.total ?? 0}</span></div>;
                  })}
                </div>
                <div className="foot"><span>Collection</span><b className="num">{inr(collected)}</b></div>
                <Link className="btn sm" href={`${base}/shows?edit=${s.id}`} style={{ alignSelf: 'flex-start' }}>Manage show</Link>
              </article>
            );
          })}
        </div>
      ) : <div className="empty"><b>No shows today</b><Link className="btn primary" href={`${base}/shows`}>Schedule shows</Link></div>}
    </>
  );
}
