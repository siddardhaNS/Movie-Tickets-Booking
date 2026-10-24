import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getMainScreen, orgOr404 } from '@/lib/tenant';
import { bookingDetail } from '@/lib/queries';
import { clock, dateKeyIn, dayWord, dur, fmtDate, fmtTime, inr2, mask } from '@/lib/format';
import { seatClass } from '@/lib/layout';
import type { Layout } from '@/lib/types';
import { Poster } from '@/components/Poster';
import { QR } from '@/components/QR';
import { SeatView } from '@/components/SeatView';
import { comfort } from '@/lib/seatgeo';
import { Steps } from '../../show/[showId]/SeatPicker';
import { Remember } from './Remember';

export const dynamic = 'force-dynamic';

function MiniMap({ layout, seats }: { layout: Layout; seats: string[] }) {
  const mine = new Set(seats);
  let prev: string | null = null;
  return (
    <div className="mini" aria-label="Your seats in the hall">
      <div className="scr" />
      {layout.map(row => {
        const gap = prev && row.cls !== prev ? <div className="cg" key={`g${row.r}`} /> : null;
        prev = row.cls;
        const half = Math.ceil(row.n / 2);
        return [gap, (
          <div className="r" key={row.r}>
            {Array.from({ length: row.n }, (_, i) => [
              i === half ? <i className="ai" key={`a${i}`} /> : null,
              row.off.includes(i + 1) ? <i className="gp" key={i} /> : <i className={mine.has(row.r + (i + 1)) ? 'y' : ''} key={i} />,
            ])}
          </div>
        )];
      })}
      <small>Your seats are lit. The screen is at the top.</small>
    </div>
  );
}

const STAGES = [['show', 'Show day'], ['gate', 'At the gate'], ['info', 'Getting there']] as const;

export default async function Ticket({ params, searchParams }: { params: Promise<{ slug: string; bookingId: string }>; searchParams: Promise<{ stage?: string }> }) {
  const { slug, bookingId } = await params;
  const org = await orgOr404(slug);
  if (!/^[0-9a-f-]{36}$/.test(bookingId)) notFound();
  const r = await bookingDetail(org.id, bookingId);
  if (!r) notFound();
  const { booking: b, show: s, movie: m } = r;
  if (b.status === 'pending') redirect(`/${slug}/checkout/${b.id}`);
  if (b.status === 'released') notFound();
  const stage = (await searchParams).stage ?? 'show';
  const screen = await getMainScreen(org.id);
  const today = dateKeyIn(org.timezone), sl = org.settings.slots.find(x => x.key === s.slot)!;
  const clsName = (k?: string) => org.settings.classes.find(c => c.key === k)?.name ?? '';
  const classes = [...new Set(b.seats.map(x => clsName(seatClass(screen.layout, x))))].join(', ');
  const gateOpen = new Date(s.startsAt.getTime() - 20 * 60e3);
  const refunded = b.status === 'refunded';

  return (
    <div className="tickwrap">
      <Remember slug={slug} bookingId={b.id} />
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Steps n={3} />
        <span className="okbadge" style={refunded ? { color: 'var(--bad)' } : undefined}><i style={refunded ? { background: 'var(--bad)' } : undefined}>{refunded ? '✕' : '✓'}</i>{refunded ? 'Refunded' : 'Booking confirmed'}</span>
        <h1 className="disp" style={{ fontSize: 'clamp(36px,6vw,52px)', lineHeight: 1 }}>{refunded ? 'Booking refunded' : 'Enjoy the show'}</h1>
        {refunded ? <p className="note">{b.refundReason}. The money goes back to the account you paid from.</p> : null}
      </div>
      {!refunded ? (
        <div className="stages" role="group" aria-label="Ticket view">
          {STAGES.map(([k, l]) => <Link key={k} href={`?stage=${k}`} replace scroll={false} aria-current={stage === k ? 'page' : undefined}>{l}</Link>)}
        </div>
      ) : null}
      <article className="ticket" aria-label="Your ticket">
        <div className="t-top"><Poster m={m} />
          <div style={{ minWidth: 0 }}><h2>{m.title}</h2><p className="mmeta">{m.lang} · {m.cert} · {dur(m.mins)}</p>
            <p className="mmeta" style={{ marginTop: 6 }}><b style={{ color: 'var(--ink)' }}>{fmtDate(s.date)}, {fmtTime(sl.time)}</b><br />{sl.label} · {org.name}, {org.city}</p></div></div>
        <div className="perf" />
        {stage === 'gate' && !refunded ? (
          <div className="t-stage"><div className="gatecard">
            <QR code={b.code} />
            <span className="code">{b.code}</span><span>{b.seats.length} × {classes} · {b.seats.join(' ')}</span>
            <small>{b.checkedInAt ? `Scanned in at ${clock(b.checkedInAt, org.timezone)}.` : 'Hold this up to the scanner at the gate. Turn your screen brightness up.'}</small>
          </div></div>
        ) : stage === 'info' && !refunded ? (
          <div className="t-stage"><p className="eyebrow">Getting there</p><div className="bigtime">Gates {clock(gateOpen, org.timezone)}</div>
            <dl className="facts"><dt>Address</dt><dd>{org.address || org.city}</dd>
              <dt>Show starts</dt><dd>{fmtTime(sl.time)}, ads run for about 10 minutes first</dd>
              <dt>Seats</dt><dd className="mono">{b.seats.join(' ')}</dd></dl>
            <MiniMap layout={screen.layout} seats={b.seats} /></div>
        ) : (
          <div className="t-stage"><p className="eyebrow">{dayWord(s.date, today)} · {sl.label}</p><div className="bigtime">{fmtTime(sl.time)}</div>
            <SeatView layout={screen.layout} seatId={b.seats[0]} movie={m} seed={s.id} label={`View of the screen from seat ${b.seats[0]}`} />
            <p className="note">Your view from {b.seats[0]}. {comfort(screen.layout, b.seats[0]).join(' · ')}</p>
            <MiniMap layout={screen.layout} seats={b.seats} /></div>
        )}
        {stage !== 'gate' || refunded ? (
          <><div className="perf" />
            <div className="t-bot">
              <dl className="kv"><dt>Booking ID</dt><dd className="mono">{b.code}</dd><dt>Seats</dt><dd className="mono">{b.seats.join(' ')}</dd>
                <dt>Class</dt><dd>{classes}</dd><dt>Paid</dt><dd className="num">{inr2(b.ticketsPaise + b.feesPaise)}</dd></dl>
              {!refunded ? <QR code={b.code} /> : null}
            </div></>
        ) : null}
      </article>
      <p className="note" style={{ textAlign: 'center' }}>Booked for {b.name} · {mask(b.phone)}. Gates open 20 minutes before the show.</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link className="btn" href={`/${slug}`}>Book another show</Link><Link className="btn" href={`/${slug}/tickets`}>My tickets</Link>
      </div>
    </div>
  );
}
