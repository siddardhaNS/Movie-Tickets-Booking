import { notFound } from 'next/navigation';
import { orgOr404, getMainScreen } from '@/lib/tenant';
import { seatStates, showWithMovie } from '@/lib/queries';
import { dateKeyIn } from '@/lib/format';
import { SeatPicker } from './SeatPicker';

export const dynamic = 'force-dynamic';

export default async function ShowPage({ params }: { params: Promise<{ slug: string; showId: string }> }) {
  const { slug, showId } = await params;
  const org = await orgOr404(slug);
  if (!/^[0-9a-f-]{36}$/.test(showId)) notFound();
  const r = await showWithMovie(org.id, showId);
  if (!r) notFound();
  const screen = await getMainScreen(org.id);
  const { states, reasons } = await seatStates(org.id, showId);
  const slot = org.settings.slots.find(s => s.key === r.show.slot)!;
  return (
    <SeatPicker
      slug={org.slug} today={dateKeyIn(org.timezone)} showId={showId}
      show={{ date: r.show.date, slotLabel: slot.label, time: slot.time, prices: r.show.prices, closed: r.show.status !== 'open' || r.show.startsAt.getTime() <= Date.now() }}
      movie={{ title: r.movie.title, cert: r.movie.cert, lang: r.movie.lang, hue: r.movie.hue }}
      layout={screen.layout} classes={org.settings.classes} maxSeats={org.settings.maxSeats}
      initialStates={states} initialReasons={reasons}
    />
  );
}
