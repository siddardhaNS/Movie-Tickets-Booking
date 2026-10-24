import { z } from 'zod';
import { apiOrg, apiStaff, handle } from '@/lib/api';
import { checkIn } from '@/lib/booking';
import { CAN } from '@/lib/auth';
import { getDb } from '@/db';

const Body = z.object({ showId: z.uuid(), code: z.string().trim().min(3).max(20) });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const org = await apiOrg((await ctx.params).slug);
  await apiStaff(org.id, CAN.gate);
  const body = Body.parse(await req.json());
  const r = await checkIn(await getDb(), org.id, body.showId, body.code);
  if (r.ok) return { ok: true, code: r.booking.code, seats: r.booking.seats };
  return { ok: false, title: r.title, msg: r.msg, code: r.booking?.code ?? body.code.toUpperCase(), seats: r.booking?.seats ?? [] };
});
