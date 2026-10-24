import Link from 'next/link';
import { CAN, requireStaff } from '@/lib/auth';
import { orgOr404 } from '@/lib/tenant';
import { bookingsForShowsBetween, moviesOf, showsBetween } from '@/lib/queries';
import { addDaysKey, dateKeyIn, dayWord, fmtDate, fmtTime, inr, inr2, weekdayLong } from '@/lib/format';
import { cancelShowAction, reopenShowAction, saveShow } from '../actions';
import { Drawer } from '../Drawer';
import { Flash } from '../Flash';

export const dynamic = 'force-dynamic';
const OPENS = { now: 'Open now', d2: '2 days before', d1: '1 day before' } as const;

export default async function Shows({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ edit?: string; new?: string; confirm?: string }> }) {
  const org = await orgOr404((await params).slug);
  await requireStaff(org.id, org.slug, CAN.manage);
  const q = await searchParams, base = `/${org.slug}/staff/owner/shows`;
  const today = dateKeyIn(org.timezone), days = Array.from({ length: 7 }, (_, i) => addDaysKey(today, i));
  const [list, movies] = await Promise.all([showsBetween(org.id, today, days[6]), moviesOf(org.id)]);
  const slots = org.settings.slots;
  const title = (id: string) => movies.find(m => m.id === id)?.title ?? '';

  let drawer = null;
  const edit = q.edit ? list.find(s => s.id === q.edit) ?? null : null;
  const [nd, ns] = q.new?.split('|') ?? [];
  if (edit || (nd && ns)) {
    const date = edit?.date ?? nd, slotKey = edit?.slot ?? ns, sl = slots.find(s => s.key === slotKey);
    const locked = !!edit && (edit.status === 'cancelled' || edit.startsAt.getTime() <= Date.now());
    const bs = edit ? (await bookingsForShowsBetween(org.id, date, date)).filter(x => x.booking.showId === edit.id) : [];
    const money = bs.reduce((n, x) => n + x.booking.ticketsPaise + x.booking.feesPaise, 0);
    const prices = edit?.prices ?? Object.fromEntries(org.settings.classes.map(c => [c.key, c.defaultPricePaise]));
    drawer = (
      <Drawer title={edit ? title(edit.movieId) : 'New show'} sub={`${dayWord(date, today)}, ${fmtDate(date)} · ${sl?.label} · ${fmtTime(sl?.time ?? '00:00')}`} closeHref={base}>
        {edit?.status === 'cancelled' ? <div className="banner">This show was cancelled. Everyone who booked was refunded.</div> : null}
        {edit ? <div className="pills"><span className="pill">{edit.sold} of {edit.sellable} sold</span><span className="pill">{inr(bs.reduce((n, x) => n + x.booking.ticketsPaise, 0))} collected</span></div> : null}
        <form className="stack" action={saveShow.bind(null, org.slug)}>
          {edit ? <input type="hidden" name="id" value={edit.id} /> : <><input type="hidden" name="date" value={date} /><input type="hidden" name="slot" value={slotKey} /></>}
          <label className="f">Movie<select className="inp" name="movieId" defaultValue={edit?.movieId} disabled={locked}>
            {movies.map(m => <option key={m.id} value={m.id}>{m.title}{m.status === 'soon' ? ' (coming soon)' : ''}</option>)}</select></label>
          <div className="fgrid">
            {org.settings.classes.map(c => (
              <label className="f" key={c.key}>{c.name} ₹<input className="inp num" type="number" min={0} step={10} name={`price_${c.key}`} defaultValue={(prices[c.key] ?? 0) / 100} disabled={locked} /></label>
            ))}
          </div>
          <label className="f">Online booking opens<select className="inp" name="opens" defaultValue={edit?.opens ?? 'now'} disabled={locked}>
            {Object.entries(OPENS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {edit ? <p className="note">Price changes apply to new bookings. People already holding seats pay the price they were shown.</p> : null}
          {!locked ? <button className="btn primary wide" type="submit">{edit ? 'Save changes' : 'Add show'}</button> : null}
        </form>
        {edit && !locked ? (
          <>
            <div className="dsec"><h3>Seats</h3><p className="note">Keep seats aside for guests, house quota or repairs.</p>
              <Link className="btn" href={`${base}/${edit.id}/block`} style={{ alignSelf: 'flex-start' }}>Block seats</Link></div>
            <div className="dsec"><h3>Cancel this show</h3>
              <p className="note">{bs.length ? `${bs.length} bookings will be refunded, ${inr2(money)} in total.` : 'No one has booked yet.'}</p>
              {q.confirm === '1'
                ? <form action={cancelShowAction.bind(null, org.slug, edit.id)} style={{ display: 'flex', gap: 8 }}>
                  <button className="btn dangerfill" type="submit">Yes, cancel and refund</button><Link className="btn" href={`${base}?edit=${edit.id}`}>Keep the show</Link></form>
                : <Link className="btn danger" href={`${base}?edit=${edit.id}&confirm=1`} scroll={false} style={{ alignSelf: 'flex-start' }}>Cancel show</Link>}
            </div>
          </>
        ) : null}
        {edit?.status === 'cancelled' && edit.startsAt.getTime() > Date.now() ? (
          <div className="dsec"><form action={reopenShowAction.bind(null, org.slug, edit.id)}><button className="btn" type="submit">Reopen for booking</button></form></div>
        ) : null}
      </Drawer>
    );
  }

  return (
    <>
      <div className="ohead"><div><p className="eyebrow">Next 7 days</p><h1>Show timings</h1></div><span className="note">Tap a show to change it, block seats or cancel it.</span></div>
      <Flash />
      <section className="card weekwrap">
        <div className="week" style={{ gridTemplateColumns: `104px repeat(${slots.length}, minmax(150px, 1fr))` }}>
          <div className="wh">Day</div>
          {slots.map(sl => <div className="wh" key={sl.key}>{sl.label}<span>{fmtTime(sl.time)}</span></div>)}
          {days.map((k, i) => [
            <div className="wd" key={k}><b>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekdayLong(k)}</b><span>{fmtDate(k)}</span></div>,
            ...slots.map(sl => {
              const s = list.find(x => x.date === k && x.slot === sl.key);
              if (!s) return <Link key={k + sl.key} className="wcell empty" href={`${base}?new=${k}|${sl.key}`} scroll={false}>+ Add show</Link>;
              const done = s.startsAt.getTime() <= Date.now();
              return (
                <Link key={k + sl.key} className={`wcell${s.status === 'cancelled' ? ' cx' : ''}`} href={`${base}?edit=${s.id}`} scroll={false} style={{ textDecoration: 'none' }}>
                  <b>{title(s.movieId)}</b>
                  <div className="bar"><i style={{ width: `${Math.round(s.sold / Math.max(1, s.sellable) * 100)}%` }} /></div>
                  <span className="wm"><span>{s.status === 'cancelled' ? 'Cancelled' : done ? 'Started' : `${s.sold}/${s.sellable} sold`}</span></span>
                </Link>
              );
            }),
          ])}
        </div>
      </section>
      {drawer}
    </>
  );
}
