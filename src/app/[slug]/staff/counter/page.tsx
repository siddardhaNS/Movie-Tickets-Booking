import type { Metadata } from 'next';
import { CAN, requireStaff } from '@/lib/auth';
import { getMainScreen, orgOr404 } from '@/lib/tenant';
import { moviesOf, shiftStats, showsBetween } from '@/lib/queries';
import { addDaysKey, dateKeyIn, zonedToUtc } from '@/lib/format';
import { StaffHeader } from '../StaffHeader';
import { Counter } from './Counter';

export const metadata: Metadata = { title: 'Box office' };
export const dynamic = 'force-dynamic';

export default async function CounterPage({ params }: { params: Promise<{ slug: string }> }) {
  const org = await orgOr404((await params).slug);
  const me = await requireStaff(org.id, org.slug, CAN.counter);
  const today = dateKeyIn(org.timezone);
  const [list, movies, screen, stats] = await Promise.all([
    showsBetween(org.id, today, addDaysKey(today, 1)), moviesOf(org.id), getMainScreen(org.id),
    shiftStats(org.id, me.id, zonedToUtc(today, '00:00', org.timezone)),
  ]);
  const shows = list.filter(s => s.status === 'open' && s.startsAt.getTime() > Date.now()).map(s => {
    const m = movies.find(x => x.id === s.movieId)!, sl = org.settings.slots.find(x => x.key === s.slot)!;
    return { id: s.id, date: s.date, time: sl.time, slotLabel: sl.label, title: m.title, prices: s.prices, sold: s.sold, sellable: s.sellable };
  });
  return (
    <>
      <StaffHeader org={org} me={me} current="counter" />
      <main className="shell">
        <Counter slug={org.slug} orgName={org.name} orgAddress={org.address || org.city} today={today} me={{ name: me.name }}
          shows={shows} layout={screen.layout} classes={org.settings.classes} maxSeats={org.settings.maxSeats} stats={stats} />
      </main>
    </>
  );
}
