import { z } from 'zod';
import { apiOrg, apiStaff, handle } from '@/lib/api';
import { holdSeats, releaseHold, removeFromHold } from '@/lib/booking';
import { CAN, currentStaff } from '@/lib/auth';
import { getDb } from '@/db';

type Ctx = { params: Promise<{ slug: string; bookingId: string }> };
const Patch = z.object({
  showId: z.uuid(),
  add: z.array(z.string().regex(/^[A-Z]+\d+$/i)).max(20).default([]),
  remove: z.array(z.string()).max(20).default([]),
});

// Box office cart: add or remove seats from the hold.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { slug, bookingId } = await ctx.params;
  const org = await apiOrg(slug);
  const me = await apiStaff(org.id, CAN.counter);
  const body = Patch.parse(await req.json());
  const db = await getDb();
  if (body.remove.length) {
    const left = await removeFromHold(db, org.id, bookingId, body.remove.map(s => s.toUpperCase()), me.id);
    if (!left) return { released: true };
    if (!body.add.length) return { bookingId, code: left.code, seats: left.seats, expiresAt: left.expiresAt, ticketsPaise: left.ticketsPaise, feesPaise: left.feesPaise };
  }
  return holdSeats(db, { orgId: org.id, showId: body.showId, seats: body.add, channel: 'counter', staffId: me.id, bookingId });
});

// Give the seats back (customer leaves checkout, or the cashier clears the cart).
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { slug, bookingId } = await ctx.params;
  const org = await apiOrg(slug);
  const db = await getDb();
  const me = await currentStaff(org.id);
  return { released: await releaseHold(db, org.id, bookingId, me?.id) };
});
