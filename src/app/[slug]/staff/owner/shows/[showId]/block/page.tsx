import { notFound } from 'next/navigation';
import { CAN, requireStaff } from '@/lib/auth';
import { getMainScreen, orgOr404 } from '@/lib/tenant';
import { seatStates, showWithMovie } from '@/lib/queries';
import { dateKeyIn, dayWord, fmtDate, fmtTime } from '@/lib/format';
import { BlockSeats } from './BlockSeats';

export const dynamic = 'force-dynamic';

export default async function BlockPage({ params }: { params: Promise<{ slug: string; showId: string }> }) {
  const { slug, showId } = await params;
  const org = await orgOr404(slug);
  await requireStaff(org.id, slug, CAN.manage);
  if (!/^[0-9a-f-]{36}$/.test(showId)) notFound();
  const r = await showWithMovie(org.id, showId);
  if (!r) notFound();
  const screen = await getMainScreen(org.id);
  const { states, reasons } = await seatStates(org.id, showId);
  const sl = org.settings.slots.find(s => s.key === r.show.slot)!;
  return (
    <BlockSeats slug={slug} showId={showId} title={r.movie.title}
      sub={`${dayWord(r.show.date, dateKeyIn(org.timezone))}, ${fmtDate(r.show.date)} · ${fmtTime(sl.time)} · ${sl.label}`}
      layout={screen.layout} classes={org.settings.classes} prices={r.show.prices} initialStates={states} initialReasons={reasons} />
  );
}
