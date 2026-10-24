import type { Metadata } from 'next';
import { CAN, requireStaff } from '@/lib/auth';
import { orgOr404 } from '@/lib/tenant';
import { moviesOf, showsBetween } from '@/lib/queries';
import { clock, dateKeyIn } from '@/lib/format';
import { StaffHeader } from '../StaffHeader';
import { Gate } from './Gate';

export const metadata: Metadata = { title: 'Entry gate' };
export const dynamic = 'force-dynamic';

export default async function GatePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ show?: string }> }) {
  const org = await orgOr404((await params).slug);
  const me = await requireStaff(org.id, org.slug, CAN.gate);
  const today = dateKeyIn(org.timezone);
  const [list, movies] = await Promise.all([showsBetween(org.id, today, today), moviesOf(org.id)]);
  const shows = list.filter(s => s.status === 'open').map(s => {
    const sl = org.settings.slots.find(x => x.key === s.slot)!;
    return {
      id: s.id, label: `${clock(s.startsAt, org.timezone)} · ${movies.find(m => m.id === s.movieId)?.title}`, slot: sl.label,
      gates: clock(s.startsAt.getTime() - 20 * 60e3, org.timezone), sold: s.sold, inside: s.checkedIn, startsAt: s.startsAt.getTime(),
    };
  });
  const req = (await searchParams).show;
  const current = shows.find(s => s.id === req) ?? shows.find(s => s.startsAt + 3 * 36e5 > Date.now()) ?? shows.at(-1);
  return (
    <>
      <StaffHeader org={org} me={me} current="gate" />
      <main className="shell">
        {current ? <Gate slug={org.slug} shows={shows} current={current} /> : <div className="gate"><div className="empty"><b>No shows today</b></div></div>}
      </main>
    </>
  );
}
