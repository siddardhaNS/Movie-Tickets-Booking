import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { apiOrg, apiStaff, handle, HttpError } from '@/lib/api';
import { confirmBooking } from '@/lib/booking';
import { CAN } from '@/lib/auth';
import { getDb } from '@/db';
import { bookings } from '@/db/schema';

const Body = z.object({
  bookingId: z.uuid(),
  pay: z.enum(['cash', 'upi']),
  ref: z.string().max(20).optional(),
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const org = await apiOrg((await ctx.params).slug);
  const me = await apiStaff(org.id, CAN.counter);
  const body = Body.parse(await req.json());
  if (body.pay === 'upi' && !/^\d{4,12}$/.test(body.ref ?? '')) {
    throw new HttpError(400, "Enter the last 4 digits of the UPI reference from the customer's phone.");
  }
  const db = await getDb();
  const [b] = await db.select().from(bookings).where(and(eq(bookings.id, body.bookingId), eq(bookings.orgId, org.id)));
  if (!b || b.staffId !== me.id) throw new HttpError(404, 'That sale is not yours or no longer exists.');
  const done = await confirmBooking(db, { orgId: org.id, bookingId: b.id, payMethod: body.pay, payRef: body.ref ?? null, name: 'Walk-in' });
  return { bookingId: done.id, code: done.code };
});
