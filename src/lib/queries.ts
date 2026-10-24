import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditLog, bookings, movies, payments, shows, staff } from '@/db/schema';
import type { SeatState } from './types';

export type ShowRow = typeof shows.$inferSelect & { sold: number; sellable: number; checkedIn: number };

/** Shows in a date range with live sold / sellable counts. Seats in a running-out hold count as free. */
export async function showsBetween(orgId: string, from: string, to: string): Promise<ShowRow[]> {
  const db = await getDb();
  const list = await db.select().from(shows)
    .where(and(eq(shows.orgId, orgId), gte(shows.date, from), lte(shows.date, to)))
    .orderBy(shows.startsAt);
  if (!list.length) return [];
  const ids = list.map(s => s.id);
  const counts = (await db.execute<{ show_id: string; sold: number; sellable: number }>(sql`
    SELECT show_id, count(*) FILTER (WHERE status = 'booked')::int AS sold,
           count(*) FILTER (WHERE status <> 'blocked')::int AS sellable
    FROM show_seats WHERE show_id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)}) GROUP BY show_id`)).rows;
  const inside = (await db.execute<{ show_id: string; n: number }>(sql`
    SELECT b.show_id, sum(jsonb_array_length(b.seats))::int AS n FROM bookings b
    WHERE b.show_id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)}) AND b.status = 'confirmed' AND b.checked_in_at IS NOT NULL
    GROUP BY b.show_id`)).rows;
  const cm = new Map(counts.map(c => [c.show_id, c])), im = new Map(inside.map(c => [c.show_id, c.n]));
  return list.map(s => ({ ...s, sold: cm.get(s.id)?.sold ?? 0, sellable: cm.get(s.id)?.sellable ?? 0, checkedIn: im.get(s.id) ?? 0 }));
}

export async function moviesOf(orgId: string) {
  const db = await getDb();
  return db.select().from(movies).where(eq(movies.orgId, orgId)).orderBy(movies.createdAt);
}
export type Movie = Awaited<ReturnType<typeof moviesOf>>[number];

export async function showWithMovie(orgId: string, showId: string) {
  const db = await getDb();
  const [r] = await db.select({ show: shows, movie: movies }).from(shows)
    .innerJoin(movies, eq(movies.id, shows.movieId))
    .where(and(eq(shows.id, showId), eq(shows.orgId, orgId)));
  return r ?? null;
}

export async function seatStates(orgId: string, showId: string, mine?: string | null) {
  const db = await getDb();
  const rows = (await db.execute<{ seat_id: string; state: SeatState; reason: string | null }>(sql`
    SELECT seat_id,
      CASE
        WHEN status = 'blocked' THEN 'blocked'
        WHEN status = 'booked' OR (status = 'held' AND held_until > now()) THEN
          CASE WHEN ${mine ?? null}::uuid IS NOT NULL AND booking_id = ${mine ?? null}::uuid THEN 'mine' ELSE 'taken' END
        ELSE 'available'
      END AS state,
      block_reason AS reason
    FROM show_seats WHERE org_id = ${orgId} AND show_id = ${showId}`)).rows;
  const states: Record<string, SeatState> = {}, reasons: Record<string, string> = {};
  for (const r of rows) { states[r.seat_id] = r.state; if (r.reason) reasons[r.seat_id] = r.reason; }
  return { states, reasons };
}

export async function bookingDetail(orgId: string, bookingId: string) {
  const db = await getDb();
  const [r] = await db.select({ booking: bookings, show: shows, movie: movies }).from(bookings)
    .innerJoin(shows, eq(shows.id, bookings.showId)).innerJoin(movies, eq(movies.id, shows.movieId))
    .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId)));
  return r ?? null;
}

export async function bookingsByIds(orgId: string, ids: string[]) {
  if (!ids.length) return [];
  const db = await getDb();
  return db.select({ booking: bookings, show: shows, movie: movies }).from(bookings)
    .innerJoin(shows, eq(shows.id, bookings.showId)).innerJoin(movies, eq(movies.id, shows.movieId))
    .where(and(eq(bookings.orgId, orgId), inArray(bookings.id, ids), inArray(bookings.status, ['confirmed', 'refunded'])));
}

export async function paymentsNeedingRefund(orgId: string) {
  const db = await getDb();
  return db.select({ payment: payments, booking: bookings }).from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .where(and(eq(payments.orgId, orgId), eq(payments.status, 'needs_refund'))).orderBy(desc(payments.createdAt));
}

export type BookingFilter = { q: string; date: 'all' | 'today' | 'upcoming' | 'past'; chan: 'all' | 'online' | 'counter'; stat: 'all' | 'confirmed' | 'refunded' };

export async function searchBookings(orgId: string, today: string, f: BookingFilter, limit = 60) {
  const db = await getDb();
  const conds = [eq(bookings.orgId, orgId), inArray(bookings.status, f.stat === 'all' ? ['confirmed', 'refunded'] : [f.stat])];
  if (f.chan !== 'all') conds.push(eq(bookings.channel, f.chan));
  if (f.date === 'today') conds.push(eq(shows.date, today));
  if (f.date === 'upcoming') conds.push(gte(shows.date, today));
  if (f.date === 'past') conds.push(sql`${shows.date} < ${today}`);
  const q = f.q.trim();
  if (q) conds.push(sql`(${bookings.code} ILIKE ${'%' + q + '%'} OR ${bookings.name} ILIKE ${'%' + q + '%'} OR ${bookings.phone} LIKE ${'%' + q + '%'})`);
  const where = and(...conds);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(bookings).innerJoin(shows, eq(shows.id, bookings.showId)).where(where);
  const rows = await db.select({ booking: bookings, show: shows, movie: movies }).from(bookings)
    .innerJoin(shows, eq(shows.id, bookings.showId)).innerJoin(movies, eq(movies.id, shows.movieId))
    .where(where).orderBy(desc(bookings.createdAt)).limit(limit);
  return { total: n, rows };
}

export async function staffOf(orgId: string) {
  const db = await getDb();
  return db.select().from(staff).where(eq(staff.orgId, orgId)).orderBy(staff.createdAt);
}

export async function auditOf(orgId: string, limit = 200) {
  const db = await getDb();
  return db.select().from(auditLog).where(eq(auditLog.orgId, orgId)).orderBy(desc(auditLog.at)).limit(limit);
}

/** Confirmed bookings for shows in a date range, for reports and the Today page. */
export async function bookingsForShowsBetween(orgId: string, from: string, to: string) {
  const db = await getDb();
  return db.select({ booking: bookings, date: shows.date, slot: shows.slot, movieId: shows.movieId }).from(bookings)
    .innerJoin(shows, eq(shows.id, bookings.showId))
    .where(and(eq(bookings.orgId, orgId), eq(bookings.status, 'confirmed'), eq(shows.status, 'open'), gte(shows.date, from), lte(shows.date, to)));
}

export async function refundsBetween(orgId: string, fromUtc: Date) {
  const db = await getDb();
  return db.select().from(bookings).where(and(eq(bookings.orgId, orgId), eq(bookings.status, 'refunded'), gte(bookings.refundedAt, fromUtc)))
    .orderBy(desc(bookings.refundedAt));
}

/** Per-class sold counts for a set of shows (Today page bars). */
export async function soldByClass(showIds: string[]) {
  if (!showIds.length) return [];
  const db = await getDb();
  return (await db.execute<{ show_id: string; cls: string; sold: number; total: number }>(sql`
    SELECT show_id, cls, count(*) FILTER (WHERE status = 'booked')::int AS sold, count(*)::int AS total
    FROM show_seats WHERE show_id IN (${sql.join(showIds.map(i => sql`${i}`), sql`, `)}) GROUP BY show_id, cls`)).rows;
}

/** Box office shift totals for one staff member today. */
export async function shiftStats(orgId: string, staffId: string, fromUtc: Date) {
  const db = await getDb();
  const list = await db.select().from(bookings).where(and(
    eq(bookings.orgId, orgId), eq(bookings.staffId, staffId), eq(bookings.channel, 'counter'), eq(bookings.status, 'confirmed'), gte(bookings.confirmedAt, fromUtc),
  ));
  return {
    sales: list.length,
    count: list.reduce((n, b) => n + b.seats.length, 0),
    cash: list.filter(b => b.payMethod === 'cash').reduce((n, b) => n + b.ticketsPaise, 0),
    upi: list.filter(b => b.payMethod === 'upi').reduce((n, b) => n + b.ticketsPaise, 0),
  };
}
