import Link from 'next/link';
import { CAN, requireStaff } from '@/lib/auth';
import { orgOr404 } from '@/lib/tenant';
import { searchBookings, type BookingFilter } from '@/lib/queries';
import { dateKeyIn, dayWord, fmtTime, inr, inr2, mask, PAY_LABEL } from '@/lib/format';
import { refundAction } from '../actions';
import { Flash } from '../Flash';

export const dynamic = 'force-dynamic';

export default async function Bookings({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const org = await orgOr404((await params).slug);
  const me = await requireStaff(org.id, org.slug, CAN.manage);
  const q = await searchParams, today = dateKeyIn(org.timezone), base = `/${org.slug}/staff/owner/bookings`;
  const f: BookingFilter = {
    q: q.q ?? '',
    date: (['all', 'today', 'upcoming', 'past'].includes(q.date ?? '') ? q.date : 'all') as BookingFilter['date'],
    chan: (['all', 'online', 'counter'].includes(q.chan ?? '') ? q.chan : 'all') as BookingFilter['chan'],
    stat: (['all', 'confirmed', 'refunded'].includes(q.stat ?? '') ? q.stat : 'all') as BookingFilter['stat'],
  };
  const { total, rows } = await searchBookings(org.id, today, f);
  const keep = new URLSearchParams(Object.entries(f).filter(([, v]) => v && v !== 'all') as [string, string][]);
  const here = `${base}${keep.size ? '?' + keep : ''}`;
  const slot = (k: string) => org.settings.slots.find(s => s.key === k)!;
  const isOwner = me.role === 'owner';

  return (
    <>
      <div className="ohead"><div><p className="eyebrow">{total} bookings</p><h1>Bookings</h1></div></div>
      <Flash />
      <section className="card hcard">
        <form className="tools" method="get">
          <label className="sr" htmlFor="bq">Search</label><input className="inp" id="bq" name="q" type="search" placeholder="Search booking ID, name or mobile" defaultValue={f.q} />
          <select className="inp" name="date" defaultValue={f.date} aria-label="Date">{[['all', 'All dates'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['past', 'Past']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select className="inp" name="chan" defaultValue={f.chan} aria-label="Channel">{[['all', 'Online and box office'], ['online', 'Online'], ['counter', 'Box office']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select className="inp" name="stat" defaultValue={f.stat} aria-label="Status">{[['all', 'Any status'], ['confirmed', 'Confirmed'], ['refunded', 'Refunded']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button className="btn" type="submit">Search</button>
        </form>
        {rows.length ? (
          <div className="tablewrap"><table className="t">
            <thead><tr><th>Booking</th><th>Show</th><th>Customer</th><th>Seats</th><th className="r">Amount</th><th>Status</th><th className="r"><span className="sr">Actions</span></th></tr></thead>
            <tbody>
              {rows.map(({ booking: b, show: s, movie: m }) => {
                const confirming = q.confirm === b.id;
                return (
                  <tr key={b.id}>
                    <td><b className="mono">{b.code}</b><span className="sub">{b.channel === 'online' ? 'Online' : 'Box office'} · {PAY_LABEL[b.payMethod ?? ''] ?? '—'}</span></td>
                    <td>{m.title}<span className="sub">{dayWord(s.date, today)} · {fmtTime(slot(s.slot)?.time ?? '00:00')}</span></td>
                    <td>{b.name}<span className="sub mono">{mask(b.phone)}</span></td>
                    <td className="mono">{b.seats.join(' ')}</td>
                    <td className="r num">{inr2(b.ticketsPaise + b.feesPaise)}</td>
                    <td>{b.status === 'refunded' ? <span className="pill bad">Refunded</span> : b.checkedInAt ? <span className="pill">Used</span> : <span className="pill ok">Confirmed</span>}</td>
                    <td><div className="acts">
                      {isOwner && b.status === 'confirmed' ? (confirming
                        ? <form action={refundAction.bind(null, org.slug, b.id, here)}><button className="btn sm dangerfill" type="submit">Confirm {inr(b.ticketsPaise + b.feesPaise)} refund</button></form>
                        : <Link className="btn sm danger" href={`${here}${keep.size ? '&' : '?'}confirm=${b.id}`} scroll={false}>Refund</Link>) : null}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        ) : <div className="empty" style={{ margin: 16 }}><b>No bookings match</b>Try a booking ID, a name or a phone number.</div>}
        {total > rows.length ? <p className="note" style={{ padding: '12px 16px' }}>Showing the latest {rows.length} of {total}. Search to find older ones.</p> : null}
      </section>
    </>
  );
}
