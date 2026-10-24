import { apiOrg, handle } from '@/lib/api';
import { bookingsByIds } from '@/lib/queries';

// "My tickets": the browser sends the booking ids it remembers (each id is an unguessable UUID).
export const GET = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const org = await apiOrg((await ctx.params).slug);
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(x => /^[0-9a-f-]{36}$/.test(x)).slice(0, 50);
  const rows = await bookingsByIds(org.id, ids);
  return {
    bookings: rows.map(({ booking: b, show: s, movie: m }) => ({
      id: b.id, code: b.code, status: b.status, seats: b.seats, used: !!b.checkedInAt,
      date: s.date, slot: s.slot, startsAt: s.startsAt, movie: { title: m.title, cert: m.cert, hue: m.hue },
    })),
  };
});
