import { z } from 'zod';
import { apiOrg, apiStaff, handle } from '@/lib/api';
import { holdSeats } from '@/lib/booking';
import { CAN } from '@/lib/auth';
import { getDb } from '@/db';

const Body = z.object({
  showId: z.uuid(),
  seats: z.array(z.string().regex(/^[A-Z]+\d+$/i)).min(1).max(20),
  channel: z.enum(['online', 'counter']).default('online'),
});

// Start a hold. Online: the customer's seats are held while they pay. Counter: a box office cart.
export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const org = await apiOrg((await ctx.params).slug);
  const body = Body.parse(await req.json());
  const staffId = body.channel === 'counter' ? (await apiStaff(org.id, CAN.counter)).id : undefined;
  return holdSeats(await getDb(), { orgId: org.id, showId: body.showId, seats: body.seats, channel: body.channel, staffId });
});
