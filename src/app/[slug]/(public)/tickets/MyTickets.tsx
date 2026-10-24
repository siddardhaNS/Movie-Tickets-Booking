'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Slot } from '@/lib/types';
import { dayWord, fmtTime } from '@/lib/format';
import { Poster } from '@/components/Poster';
import { readTickets } from './store';

type Row = { id: string; code: string; status: string; seats: string[]; used: boolean; date: string; slot: string; startsAt: string; movie: { title: string; cert: string; hue: number } };

export function MyTickets({ slug, today, slots }: { slug: string; today: string; slots: Slot[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    const ids = readTickets(slug);
    if (!ids.length) { setRows([]); return; }
    fetch(`/api/t/${slug}/bookings?ids=${ids.join(',')}`).then(r => r.json()).then(d => setRows(d.bookings ?? [])).catch(() => setRows([]));
  }, [slug]);

  if (rows === null) return <div className="empty"><div className="spinner" aria-hidden="true" />Loading your tickets…</div>;
  if (!rows.length) return (
    <div className="empty"><b>No tickets yet</b>Book a show and your tickets appear here on this device, with the QR code for the gate.
      <Link className="btn primary" href={`/${slug}`}>Browse movies</Link></div>
  );
  const now = Date.now();
  const up = rows.filter(r => new Date(r.startsAt).getTime() > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = rows.filter(r => new Date(r.startsAt).getTime() <= now).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const card = (b: Row) => (
    <Link key={b.id} className="card tcard" href={`/${slug}/ticket/${b.id}`} style={{ textDecoration: 'none' }}>
      <Poster m={b.movie} />
      <div style={{ minWidth: 0 }}><h3>{b.movie.title}</h3>
        <span>{dayWord(b.date, today)} · {fmtTime(slots.find(s => s.key === b.slot)?.time ?? '00:00')}</span><span className="mono">{b.seats.join(' ')}</span>
        <div className="pills" style={{ marginTop: 6 }}>{b.status === 'refunded' ? <span className="pill bad">Refunded</span> : b.used ? <span className="pill">Used</span> : <span className="pill ok">Confirmed</span>}</div>
      </div>
    </Link>
  );
  return (
    <>
      {up.length ? <><div className="sec" style={{ marginTop: 4 }}><h2>Upcoming</h2></div><div className="tlist">{up.map(card)}</div></> : null}
      {past.length ? <><div className="sec"><h2>Past</h2></div><div className="tlist">{past.map(card)}</div></> : null}
    </>
  );
}
