import { z } from 'zod';
import { apiOrg, handle } from '@/lib/api';
import { payOnline } from '@/lib/payments';
import { getDb } from '@/db';

const Body = z.object({
  name: z.string().trim().min(2, 'Enter the name the booking should be under.').max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.'),
  method: z.enum(['upi', 'card', 'nb']),
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ slug: string; bookingId: string }> }) => {
  const { slug, bookingId } = await ctx.params;
  const org = await apiOrg(slug);
  const body = Body.parse(await req.json());
  const b = await payOnline(await getDb(), org.id, bookingId, body);
  return { bookingId: b.id, code: b.code };
});
