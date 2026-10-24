import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { orgOr404 } from '@/lib/tenant';
import { bookingDetail } from '@/lib/queries';
import { dateKeyIn, dayWord, fmtDate, fmtTime, inr, inr2 } from '@/lib/format';
import { Poster } from '@/components/Poster';
import { seatClass } from '@/lib/layout';
import { getMainScreen } from '@/lib/tenant';
import { BackButton, CheckoutForm, HoldTimer } from './CheckoutForm';
import { Steps } from '../../show/[showId]/SeatPicker';

export const dynamic = 'force-dynamic';

export default async function Checkout({ params }: { params: Promise<{ slug: string; bookingId: string }> }) {
  const { slug, bookingId } = await params;
  const org = await orgOr404(slug);
  if (!/^[0-9a-f-]{36}$/.test(bookingId)) notFound();
  const r = await bookingDetail(org.id, bookingId);
  if (!r || r.booking.channel !== 'online') notFound();
  const { booking: b, show: s, movie: m } = r;
  if (b.status === 'confirmed' || b.status === 'refunded') redirect(`/${slug}/ticket/${b.id}`);

  const today = dateKeyIn(org.timezone), sl = org.settings.slots.find(x => x.key === s.slot)!;
  const expired = b.status !== 'pending' || b.expiresAt.getTime() <= Date.now();
  if (expired) {
    return (
      <div className="empty" style={{ marginTop: 24 }}>
        <b>Your seat hold ran out</b>
        The seats went back on sale. Pick them again; they may still be free.
        <Link className="btn primary" href={`/${slug}/show/${s.id}`}>Pick seats again</Link>
      </div>
    );
  }
  const screen = await getMainScreen(org.id);
  const byCls = org.settings.classes
    .map(c => ({ c, seats: b.seats.filter(x => seatClass(screen.layout, x) === c.key) }))
    .filter(x => x.seats.length);
  const gst = b.feesPaise - b.seats.length * org.settings.bookingFeePaise;

  return (
    <>
      <div className="crumbs">
        <BackButton slug={slug} bookingId={b.id} showId={s.id} />
        <div className="ttl"><h2>Review and pay</h2><span>{m.title} · {dayWord(s.date, today)}, {fmtTime(sl.time)}</span></div>
        <Steps n={2} />
      </div>
      <div className="co">
        <section className="card panel" aria-label="Order summary">
          <HoldTimer until={b.expiresAt.toISOString()} slug={slug} showId={s.id} />
          <div className="sum"><Poster m={m} />
            <div style={{ minWidth: 0 }}><h3>{m.title}</h3>
              <p className="mmeta">{dayWord(s.date, today)}, {fmtDate(s.date)} · {fmtTime(sl.time)} · {sl.label}</p>
              <div className="chips" style={{ marginTop: 8 }}>{b.seats.map(x => <span key={x} className="schip" style={{ paddingRight: 10 }}>{x}</span>)}</div></div></div>
          <div className="lines">
            {byCls.map(g => <div key={g.c.key}><span>{g.c.name} × {g.seats.length}</span><span className="num">{inr(g.seats.length * (b.prices[g.c.key] ?? 0))}</span></div>)}
            <div className="sub"><span>Booking fee ({inr(org.settings.bookingFeePaise)} × {b.seats.length})</span><span className="num">{inr(b.seats.length * org.settings.bookingFeePaise)}</span></div>
            <div className="sub"><span>GST on booking fee</span><span className="num">{inr2(gst)}</span></div>
            <div className="tot"><span>Total</span><span className="num">{inr2(b.ticketsPaise + b.feesPaise)}</span></div>
          </div>
        </section>
        <CheckoutForm slug={slug} bookingId={b.id} total={b.ticketsPaise + b.feesPaise} />
      </div>
    </>
  );
}
