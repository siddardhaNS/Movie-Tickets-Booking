import { and, eq, sql } from 'drizzle-orm';
import type { DB, Tx } from '@/db';
import { bookings, organizations, payments, shows, tickets, auditLog } from '@/db/schema';
import type { OrgSettings, Prices } from './types';
import { addDaysKey, zonedToUtc } from './format';

/*
 * Seat selling engine. Every path that gives a seat to someone goes through a transaction that
 *   1. locks the seat rows in show_seats with SELECT ... ORDER BY seat_id FOR UPDATE
 *      (fixed order, so two buyers grabbing overlapping seats cannot deadlock),
 *   2. checks each seat is free (available, or held by a hold that has run out),
 *   3. flips them with a conditional UPDATE and checks the row count.
 * A second buyer waiting on the same row lock re-reads the row after the first commits, sees it
 * held, and gets SEATS_TAKEN. The partial unique index on tickets backs this up at confirm time.
 */

export type BookingErrorCode =
  | 'SEATS_TAKEN' | 'UNKNOWN_SEAT' | 'TOO_MANY' | 'NO_SEATS' | 'SHOW_CLOSED' | 'NOT_OPEN_YET'
  | 'HOLD_EXPIRED' | 'NOT_FOUND' | 'BAD_STATE' | 'PAID_AFTER_EXPIRY';

export class BookingError extends Error {
  constructor(public code: BookingErrorCode, message: string, public seats: string[] = []) { super(message); }
}

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = (prefix: string) =>
  prefix + Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');

const inList = (ids: string[]) => sql.join(ids.map(x => sql`${x}`), sql`, `);

// Drivers (and drizzle's wrapper) put the Postgres error on the error itself or on .cause.
function pgError(e: unknown): { code?: string; text: string } {
  type PgErr = { code?: string; constraint?: string; message?: string; cause?: PgErr };
  const err = e as PgErr, inner = err?.cause ?? err;
  return { code: inner?.code ?? err?.code, text: `${inner?.constraint ?? ''} ${inner?.message ?? ''} ${err?.message ?? ''}` };
}

/** Retry on deadlock / serialization failure / a booking-code collision. */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      const { code, text } = pgError(e);
      const retryable = code === '40P01' || code === '40001' || (code === '23505' && text.includes('bookings_org_code'));
      if (retryable && i < tries - 1) continue;
      if (code === '23505' && text.includes('tickets_one_valid_per_seat')) {
        throw new BookingError('SEATS_TAKEN', 'Those seats were just booked by someone else.');
      }
      if (code === '40P01' || code === '40001') throw new BookingError('SEATS_TAKEN', 'Those seats were just taken. Try again.');
      throw e;
    }
  }
}

type SaleContext = {
  show: typeof shows.$inferSelect;
  settings: OrgSettings;
  timezone: string;
};

async function saleContext(tx: Tx, orgId: string, showId: string): Promise<SaleContext> {
  const [row] = await tx
    .select({ show: shows, settings: organizations.settings, timezone: organizations.timezone, active: organizations.active })
    .from(shows).innerJoin(organizations, eq(organizations.id, shows.orgId))
    .where(and(eq(shows.id, showId), eq(shows.orgId, orgId)));
  if (!row || !row.active) throw new BookingError('NOT_FOUND', 'Show not found.');
  return { show: row.show, settings: row.settings, timezone: row.timezone };
}

function assertSellable(ctx: SaleContext, channel: 'online' | 'counter') {
  const { show } = ctx;
  if (show.status !== 'open') throw new BookingError('SHOW_CLOSED', 'This show was cancelled.');
  if (show.startsAt.getTime() <= Date.now()) throw new BookingError('SHOW_CLOSED', 'This show has already started.');
  if (channel === 'online' && show.opens !== 'now') {
    const opensAt = zonedToUtc(addDaysKey(show.date, show.opens === 'd1' ? -1 : -2), '00:00', ctx.timezone);
    if (Date.now() < opensAt.getTime()) throw new BookingError('NOT_OPEN_YET', 'Online booking for this show has not opened yet.');
  }
}

export function priceSeats(seatCls: Map<string, string>, prices: Prices, settings: OrgSettings, channel: 'online' | 'counter') {
  const ticketsPaise = [...seatCls.values()].reduce((n, c) => n + (prices[c] ?? 0), 0);
  const feesPaise = channel === 'online' ? Math.round(seatCls.size * settings.bookingFeePaise * (1 + settings.gstRate)) : 0;
  return { ticketsPaise, feesPaise };
}

export type HoldInput = {
  orgId: string;
  showId: string;
  seats: string[];
  channel: 'online' | 'counter';
  staffId?: string;
  /** Box office only: add these seats to an existing cart hold instead of starting a new one. */
  bookingId?: string;
};

export type HoldResult = {
  bookingId: string; code: string; seats: string[]; expiresAt: Date; ticketsPaise: number; feesPaise: number;
};

export function holdSeats(db: DB, input: HoldInput): Promise<HoldResult> {
  const want = [...new Set(input.seats.map(s => s.trim().toUpperCase()))];
  if (!want.length && !input.bookingId) throw new BookingError('NO_SEATS', 'Pick at least one seat.');

  return withRetry(() => db.transaction(async tx => {
    const ctx = await saleContext(tx, input.orgId, input.showId);
    assertSellable(ctx, input.channel);
    const holdMins = input.channel === 'online' ? ctx.settings.holdMinutes : ctx.settings.counterHoldMinutes;

    let booking: typeof bookings.$inferSelect;
    if (input.bookingId) {
      const [b] = await tx.select().from(bookings).where(and(
        eq(bookings.id, input.bookingId), eq(bookings.orgId, input.orgId), eq(bookings.showId, input.showId),
      )).for('update');
      if (!b || b.status !== 'pending' || b.channel !== input.channel || (input.staffId && b.staffId !== input.staffId)) {
        throw new BookingError('HOLD_EXPIRED', 'That hold is no longer active. Start again.');
      }
      if (b.expiresAt.getTime() <= Date.now()) throw new BookingError('HOLD_EXPIRED', 'The hold ran out, so the seats went back on sale.');
      booking = b;
    } else {
      [booking] = await tx.insert(bookings).values({
        orgId: input.orgId, showId: input.showId, code: newCode(ctx.settings.codePrefix), channel: input.channel,
        status: 'pending', seats: [], prices: ctx.show.prices, staffId: input.staffId ?? null,
        ticketsPaise: 0, feesPaise: 0, expiresAt: sql`now() + make_interval(mins => ${holdMins})` as unknown as Date,
      }).returning();
    }

    const fresh = want.filter(s => !booking.seats.includes(s));
    const all = [...booking.seats, ...fresh];
    if (all.length > ctx.settings.maxSeats) throw new BookingError('TOO_MANY', `You can book up to ${ctx.settings.maxSeats} seats at a time.`);

    if (fresh.length) {
      // 1. Lock in a fixed order.
      const locked = (await tx.execute<{ seat_id: string; status: string; booking_id: string | null; live: boolean }>(sql`
        SELECT seat_id, status, booking_id, (held_until > now()) AS live
        FROM show_seats WHERE show_id = ${input.showId} AND seat_id IN (${inList(fresh)})
        ORDER BY seat_id FOR UPDATE`)).rows;

      // 2. Check.
      const found = new Set(locked.map(r => r.seat_id));
      const unknown = fresh.filter(s => !found.has(s));
      if (unknown.length) throw new BookingError('UNKNOWN_SEAT', `${unknown.join(', ')} ${unknown.length > 1 ? 'are not seats' : 'is not a seat'} in this hall.`, unknown);
      const taken = locked.filter(r => !(r.status === 'available' || (r.status === 'held' && !r.live))).map(r => r.seat_id);
      if (taken.length) throw new BookingError('SEATS_TAKEN', `${taken.join(', ')} ${taken.length > 1 ? 'are' : 'is'} no longer available.`, taken);

      // 3. Flip, with the same condition repeated in the WHERE as a belt-and-braces check.
      const flipped = (await tx.execute<{ seat_id: string }>(sql`
        UPDATE show_seats SET status = 'held', booking_id = ${booking.id}, held_until = now() + make_interval(mins => ${holdMins})
        WHERE show_id = ${input.showId} AND seat_id IN (${inList(fresh)})
          AND (status = 'available' OR (status = 'held' AND held_until <= now()))
        RETURNING seat_id`)).rows;
      if (flipped.length !== fresh.length) throw new BookingError('SEATS_TAKEN', 'Some of those seats were just taken.');
    }

    // Refresh the timer on every seat in the hold (box office carts restart the clock on each change).
    await tx.execute(sql`
      UPDATE show_seats SET held_until = now() + make_interval(mins => ${holdMins})
      WHERE booking_id = ${booking.id} AND status = 'held'`);

    const clsRows = (await tx.execute<{ seat_id: string; cls: string }>(sql`
      SELECT seat_id, cls FROM show_seats WHERE show_id = ${input.showId} AND booking_id = ${booking.id} AND status = 'held'`)).rows;
    const seatCls = new Map(clsRows.map(r => [r.seat_id, r.cls]));
    const { ticketsPaise, feesPaise } = priceSeats(seatCls, booking.prices, ctx.settings, input.channel);

    const [b] = await tx.update(bookings).set({
      seats: all, ticketsPaise, feesPaise, expiresAt: sql`now() + make_interval(mins => ${holdMins})` as unknown as Date,
    }).where(eq(bookings.id, booking.id)).returning();
    return { bookingId: b.id, code: b.code, seats: b.seats, expiresAt: b.expiresAt, ticketsPaise, feesPaise };
  }));
}

/** Box office: take seats back out of the cart. Releases the hold entirely when it becomes empty. */
export function removeFromHold(db: DB, orgId: string, bookingId: string, seats: string[], staffId?: string) {
  return withRetry(() => db.transaction(async tx => {
    const [b] = await tx.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId))).for('update');
    if (!b || b.status !== 'pending' || (staffId && b.staffId !== staffId)) return null;
    const drop = seats.filter(s => b.seats.includes(s));
    if (drop.length) {
      await tx.execute(sql`
        UPDATE show_seats SET status = 'available', booking_id = NULL, held_until = NULL
        WHERE booking_id = ${bookingId} AND status = 'held' AND seat_id IN (${inList(drop)})`);
    }
    const left = b.seats.filter(s => !drop.includes(s));
    if (!left.length) {
      await tx.update(bookings).set({ status: 'released', seats: [] }).where(eq(bookings.id, bookingId));
      return null;
    }
    const ctx = await saleContext(tx, orgId, b.showId);
    const clsRows = (await tx.execute<{ seat_id: string; cls: string }>(sql`
      SELECT seat_id, cls FROM show_seats WHERE booking_id = ${bookingId} AND status = 'held'`)).rows;
    const { ticketsPaise, feesPaise } = priceSeats(new Map(clsRows.map(r => [r.seat_id, r.cls])), b.prices, ctx.settings, b.channel);
    const [nb] = await tx.update(bookings).set({ seats: left, ticketsPaise, feesPaise }).where(eq(bookings.id, bookingId)).returning();
    return nb;
  }));
}

/** Online holds can be released by whoever has the booking id; box office carts only by their own cashier. */
export function releaseHold(db: DB, orgId: string, bookingId: string, staffId?: string) {
  return db.transaction(async tx => {
    const [b] = await tx.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId))).for('update');
    if (!b || b.status !== 'pending' || (b.channel === 'counter' && b.staffId !== staffId)) return false;
    await tx.execute(sql`
      UPDATE show_seats SET status = 'available', booking_id = NULL, held_until = NULL
      WHERE booking_id = ${bookingId} AND status = 'held'`);
    await tx.update(bookings).set({ status: 'released' }).where(eq(bookings.id, bookingId));
    return true;
  });
}

/** Online checkout: before taking money, make sure the hold is alive and give it room for the payment to finish. */
export function prepareForPayment(db: DB, orgId: string, bookingId: string, buyer: { name: string; phone: string }, graceMinutes = 3) {
  return db.transaction(async tx => {
    const [b] = await tx.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId))).for('update');
    if (!b) throw new BookingError('NOT_FOUND', 'Booking not found.');
    if (b.status === 'confirmed') return b;
    if (b.status !== 'pending' || b.expiresAt.getTime() <= Date.now()) {
      throw new BookingError('HOLD_EXPIRED', 'Your seat hold ran out, so the seats went back on sale. Pick them again.');
    }
    const live = (await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM show_seats WHERE booking_id = ${bookingId} AND status = 'held' AND held_until > now()`)).rows[0].n;
    if (live !== b.seats.length) throw new BookingError('HOLD_EXPIRED', 'Your seat hold ran out, so the seats went back on sale. Pick them again.');
    await tx.execute(sql`
      UPDATE show_seats SET held_until = GREATEST(held_until, now() + make_interval(mins => ${graceMinutes}))
      WHERE booking_id = ${bookingId} AND status = 'held'`);
    const [nb] = await tx.update(bookings).set({
      name: buyer.name, phone: buyer.phone,
      expiresAt: sql`GREATEST(expires_at, now() + make_interval(mins => ${graceMinutes}))` as unknown as Date,
    }).where(eq(bookings.id, bookingId)).returning();
    return nb;
  });
}

export type ConfirmInput = {
  orgId: string;
  bookingId: string;
  payMethod: string;
  payRef?: string | null;
  name?: string;
  phone?: string;
  payment?: { provider: string; providerRef: string; amountPaise: number };
};

/** Turn a live hold into sold tickets. Idempotent: confirming an already-confirmed booking returns it. */
export function confirmBooking(db: DB, input: ConfirmInput) {
  return withRetry(() => db.transaction(async tx => {
    const [b] = await tx.select().from(bookings).where(and(eq(bookings.id, input.bookingId), eq(bookings.orgId, input.orgId))).for('update');
    if (!b) throw new BookingError('NOT_FOUND', 'Booking not found.');
    if (b.status === 'confirmed') return b;
    if (b.status !== 'pending') throw new BookingError('HOLD_EXPIRED', 'The seat hold ran out, so the seats went back on sale.');

    const sold = (await tx.execute<{ seat_id: string; cls: string }>(sql`
      UPDATE show_seats SET status = 'booked', held_until = NULL
      WHERE booking_id = ${b.id} AND status = 'held' AND held_until > now()
      RETURNING seat_id, cls`)).rows;
    if (sold.length !== b.seats.length || !b.seats.length) {
      throw new BookingError('HOLD_EXPIRED', 'The seat hold ran out, so the seats went back on sale.');
    }

    // Second guarantee: tickets_one_valid_per_seat rejects a duplicate valid ticket outright.
    await tx.insert(tickets).values(sold.map(r => ({
      orgId: b.orgId, bookingId: b.id, showId: b.showId, seatId: r.seat_id, cls: r.cls, pricePaise: b.prices[r.cls] ?? 0,
    })));

    if (input.payment) {
      await tx.insert(payments).values({
        orgId: b.orgId, bookingId: b.id, provider: input.payment.provider, providerRef: input.payment.providerRef,
        method: input.payMethod, amountPaise: input.payment.amountPaise, status: 'captured',
      });
    }

    const [nb] = await tx.update(bookings).set({
      status: 'confirmed', confirmedAt: sql`now()` as unknown as Date, payMethod: input.payMethod, payRef: input.payRef ?? null,
      ...(input.name !== undefined ? { name: input.name } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}),
    }).where(eq(bookings.id, b.id)).returning();
    return nb;
  }));
}

/** Money arrived but the hold had already gone: record it so the owner sees it and refunds it. */
export async function recordOrphanPayment(db: DB, orgId: string, bookingId: string, p: { provider: string; providerRef: string; amountPaise: number; method: string }) {
  await db.insert(payments).values({
    orgId, bookingId, provider: p.provider, providerRef: p.providerRef, method: p.method, amountPaise: p.amountPaise,
    status: 'needs_refund', note: 'Money received after the seats were released. Booking was not confirmed.',
  }).onConflictDoNothing();
}

export function refundBooking(db: DB, orgId: string, bookingId: string, actor: string, reason: string) {
  return db.transaction(async tx => {
    const [b] = await tx.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId))).for('update');
    if (!b || b.status !== 'confirmed') throw new BookingError('BAD_STATE', 'Only confirmed bookings can be refunded.');
    await refundInTx(tx, b, reason);
    await tx.insert(auditLog).values({ orgId, actor, action: `Refunded booking ${b.code}`, detail: `${b.seats.join(' ')} · ${reason}` });
    return b;
  });
}

async function refundInTx(tx: Tx, b: typeof bookings.$inferSelect, reason: string) {
  await tx.update(tickets).set({ status: 'void' }).where(and(eq(tickets.bookingId, b.id), eq(tickets.status, 'valid')));
  // Put the seats back on sale.
  await tx.execute(sql`
    UPDATE show_seats SET status = 'available', booking_id = NULL, held_until = NULL
    WHERE booking_id = ${b.id} AND status = 'booked'`);
  await tx.update(payments).set({ status: 'refunded' }).where(and(eq(payments.bookingId, b.id), eq(payments.status, 'captured')));
  await tx.update(bookings).set({ status: 'refunded', refundedAt: sql`now()` as unknown as Date, refundReason: reason }).where(eq(bookings.id, b.id));
}

export function cancelShow(db: DB, orgId: string, showId: string, actor: string) {
  return db.transaction(async tx => {
    const [s] = await tx.select().from(shows).where(and(eq(shows.id, showId), eq(shows.orgId, orgId))).for('update');
    if (!s || s.status !== 'open') throw new BookingError('BAD_STATE', 'This show is not open.');
    await tx.update(shows).set({ status: 'cancelled' }).where(eq(shows.id, showId));
    const list = await tx.select().from(bookings).where(and(eq(bookings.showId, showId), eq(bookings.status, 'confirmed'))).for('update');
    for (const b of list) await refundInTx(tx, b, 'Show cancelled by the theatre');
    // Drop any carts or checkouts in progress.
    await tx.execute(sql`UPDATE show_seats SET status = 'available', booking_id = NULL, held_until = NULL WHERE show_id = ${showId} AND status = 'held'`);
    await tx.execute(sql`UPDATE bookings SET status = 'released' WHERE show_id = ${showId} AND status = 'pending'`);
    return list.length;
  });
}

/** Toggle a seat between blocked and available. Booked or currently held seats cannot be blocked. */
export async function toggleBlock(db: DB, orgId: string, showId: string, seatId: string, reason: string) {
  const r = (await db.execute<{ status: string }>(sql`
    UPDATE show_seats SET
      status = CASE WHEN status = 'blocked' THEN 'available' ELSE 'blocked' END,
      block_reason = CASE WHEN status = 'blocked' THEN NULL ELSE ${reason} END,
      booking_id = CASE WHEN status = 'blocked' THEN booking_id ELSE NULL END,
      held_until = NULL
    WHERE org_id = ${orgId} AND show_id = ${showId} AND seat_id = ${seatId}
      AND (status IN ('available', 'blocked') OR (status = 'held' AND held_until <= now()))
    RETURNING status`)).rows;
  if (!r.length) throw new BookingError('SEATS_TAKEN', `${seatId} is booked or in someone's cart, so it can't be blocked.`);
  return r[0].status;
}

export type GateResult =
  | { ok: true; booking: typeof bookings.$inferSelect }
  | { ok: false; title: string; msg: string; booking?: typeof bookings.$inferSelect };

/** Atomic check-in: the same ticket can only get in once, even if two gates scan it at the same moment. */
export async function checkIn(db: DB, orgId: string, showId: string, code: string): Promise<GateResult> {
  const c = code.trim().toUpperCase();
  const [ok] = await db.update(bookings).set({ checkedInAt: sql`now()` as unknown as Date }).where(and(
    eq(bookings.orgId, orgId), eq(bookings.code, c), eq(bookings.showId, showId), eq(bookings.status, 'confirmed'),
    sql`${bookings.checkedInAt} IS NULL`,
  )).returning();
  if (ok) return { ok: true, booking: ok };

  const [b] = await db.select().from(bookings).where(and(eq(bookings.orgId, orgId), eq(bookings.code, c)));
  if (!b || b.status === 'pending' || b.status === 'released') return { ok: false, title: 'Ticket not found', msg: 'Check the booking ID, or send them to the box office.' };
  if (b.status === 'refunded') return { ok: false, title: 'Ticket was refunded', msg: 'This booking was cancelled and refunded. Send them to the box office.', booking: b };
  if (b.showId !== showId) return { ok: false, title: 'Wrong show', msg: 'This ticket is for a different show.', booking: b };
  return { ok: false, title: 'Already used', msg: `Scanned already for ${b.seats.join(' ')}.`, booking: b };
}

/** Housekeeping: mark holds that ran out as released. Not needed for correctness, only for tidy data. */
export async function sweepExpired(db: DB, orgId: string) {
  await db.execute(sql`
    UPDATE show_seats SET status = 'available', booking_id = NULL, held_until = NULL
    WHERE org_id = ${orgId} AND status = 'held' AND held_until <= now()`);
  await db.execute(sql`
    UPDATE bookings SET status = 'released'
    WHERE org_id = ${orgId} AND status = 'pending' AND expires_at <= now() - interval '1 minute'`);
}
