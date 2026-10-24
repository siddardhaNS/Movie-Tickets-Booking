import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import type { DB, Tx } from '@/db';
import { auditLog, organizations, screens, shows, staff } from '@/db/schema';
import { allSeats, defaultLayout, defaultSettings } from './layout';
import { zonedToUtc } from './format';
import type { Layout, OrgSettings, Prices } from './types';

export const hashSecret = (s: string) => bcrypt.hash(s, 10);
export const checkSecret = (s: string, hash: string) => bcrypt.compare(s, hash);

export type NewOrg = {
  name: string; slug: string; city: string; address: string; timezone?: string;
  ownerName: string; ownerPhone: string; ownerPin: string; codePrefix?: string;
};

export function createOrganization(db: DB, input: NewOrg, actor: string) {
  return db.transaction(async tx => {
    const prefix = (input.codePrefix || input.name.replace(/[^A-Za-z]/g, '').slice(0, 2) || 'TK').toUpperCase().slice(0, 2);
    const [org] = await tx.insert(organizations).values({
      name: input.name, slug: input.slug.toLowerCase(), city: input.city, address: input.address,
      timezone: input.timezone ?? 'Asia/Kolkata', settings: defaultSettings(prefix),
    }).returning();
    await tx.insert(screens).values({ orgId: org.id, name: 'Main screen', layout: defaultLayout() });
    await tx.insert(staff).values({
      orgId: org.id, name: input.ownerName, phone: input.ownerPhone, role: 'owner', pinHash: await hashSecret(input.ownerPin),
    });
    await tx.insert(auditLog).values({ orgId: org.id, actor, action: 'Theatre created', detail: `Owner ${input.ownerName}` });
    return org;
  });
}

/** Create a show and lay out one show_seats row per seat in the hall. */
export async function createShowTx(tx: Tx, args: {
  orgId: string; screenId: string; layout: Layout; settings: OrgSettings; timezone: string;
  movieId: string; date: string; slot: string; prices: Prices; opens: 'now' | 'd1' | 'd2';
}) {
  const sl = args.settings.slots.find(s => s.key === args.slot);
  if (!sl) throw new Error('Unknown show time');
  const [show] = await tx.insert(shows).values({
    orgId: args.orgId, screenId: args.screenId, movieId: args.movieId, date: args.date, slot: args.slot,
    startsAt: zonedToUtc(args.date, sl.time, args.timezone), prices: args.prices, opens: args.opens,
  }).returning();
  const clsOf = new Map(args.layout.map(r => [r.r, r.cls]));
  const rows = allSeats(args.layout).map(seatId => {
    const reason = args.settings.defaultBlocked[seatId];
    return {
      showId: show.id, seatId, orgId: args.orgId, cls: clsOf.get(seatId.match(/^[A-Z]+/)![0])!,
      status: (reason ? 'blocked' : 'available') as 'blocked' | 'available', blockReason: reason ?? null,
    };
  });
  if (rows.length) await tx.execute(sql`
    INSERT INTO show_seats (show_id, seat_id, org_id, cls, status, block_reason)
    SELECT * FROM jsonb_to_recordset(${JSON.stringify(rows.map(r => ({ show_id: r.showId, seat_id: r.seatId, org_id: r.orgId, cls: r.cls, status: r.status, block_reason: r.blockReason })))}::jsonb)
      AS x(show_id uuid, seat_id text, org_id uuid, cls text, status text, block_reason text)`);
  return show;
}

/**
 * Apply a new hall layout to upcoming shows: add new seats, update classes of unsold seats,
 * and remove seats that no longer exist unless someone holds or bought them.
 */
export async function applyLayoutToUpcoming(tx: Tx, orgId: string, screenId: string, layout: Layout) {
  const clsOf = new Map(layout.map(r => [r.r, r.cls]));
  const seats = allSeats(layout).map(id => ({ seat_id: id, cls: clsOf.get(id.match(/^[A-Z]+/)![0])! }));
  const payload = JSON.stringify(seats);
  const upcoming = sql`SELECT id FROM shows WHERE org_id = ${orgId} AND screen_id = ${screenId} AND status = 'open' AND starts_at > now()`;
  await tx.execute(sql`
    INSERT INTO show_seats (show_id, seat_id, org_id, cls)
    SELECT s.id, x.seat_id, ${orgId}, x.cls FROM (${upcoming}) s
    CROSS JOIN jsonb_to_recordset(${payload}::jsonb) AS x(seat_id text, cls text)
    ON CONFLICT (show_id, seat_id) DO NOTHING`);
  await tx.execute(sql`
    UPDATE show_seats ss SET cls = x.cls
    FROM jsonb_to_recordset(${payload}::jsonb) AS x(seat_id text, cls text)
    WHERE ss.seat_id = x.seat_id AND ss.show_id IN (${upcoming}) AND ss.status IN ('available', 'blocked') AND ss.cls <> x.cls`);
  await tx.execute(sql`
    DELETE FROM show_seats ss
    WHERE ss.show_id IN (${upcoming})
      AND ss.seat_id NOT IN (SELECT seat_id FROM jsonb_to_recordset(${payload}::jsonb) AS x(seat_id text))
      AND (ss.status IN ('available', 'blocked') OR (ss.status = 'held' AND ss.held_until <= now()))`);
}

export async function audit(db: DB | Tx, orgId: string, actor: string, action: string, detail = '') {
  await db.insert(auditLog).values({ orgId, actor, action, detail });
}

export async function staffByPhone(db: DB, orgId: string, phone: string) {
  const [m] = await db.select().from(staff).where(and(eq(staff.orgId, orgId), eq(staff.phone, phone)));
  return m ?? null;
}
