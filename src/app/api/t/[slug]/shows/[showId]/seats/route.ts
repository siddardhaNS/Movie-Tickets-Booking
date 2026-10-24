import { apiOrg, handle } from '@/lib/api';
import { seatStates } from '@/lib/queries';

// Live seat map, polled by the customer seat picker and the box office.
export const GET = handle(async (req: Request, ctx: { params: Promise<{ slug: string; showId: string }> }) => {
  const { slug, showId } = await ctx.params;
  const org = await apiOrg(slug);
  const mine = new URL(req.url).searchParams.get('hold');
  return seatStates(org.id, showId, mine && /^[0-9a-f-]{36}$/.test(mine) ? mine : null);
});
