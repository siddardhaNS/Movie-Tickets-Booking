/*
 * Concurrency test for the "no seat is sold twice" guarantee.
 * Run against real Postgres for true parallelism:  DATABASE_URL=postgres://... npm run test:race
 * (Without DATABASE_URL it runs on embedded PGlite, which executes one query at a time.)
 */
import { eq, sql } from 'drizzle-orm';
import { getDb, closeDb } from '@/db';
import * as t from '@/db/schema';
import { BookingError, checkIn, confirmBooking, holdSeats, refundBooking } from '@/lib/booking';
import { createOrganization, createShowTx } from '@/lib/orgs';
import { addDaysKey, dateKeyIn } from '@/lib/format';

const db = await getDb();
let failures = 0;
const check = (cond: boolean, msg: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const settle = <T,>(ps: Promise<T>[]) => Promise.allSettled(ps);
const reason = (r: PromiseSettledResult<unknown>) => r.status === 'rejected' ? (r.reason instanceof BookingError ? r.reason.code : String(r.reason)) : 'ok';

const slug = `race-${Date.now().toString(36)}`;
const org = await createOrganization(db, { name: 'Race Test', slug, city: '', address: '', ownerName: 'T', ownerPhone: '9000000000', ownerPin: '0000', codePrefix: 'RT' }, 'test');
const [screen] = await db.select().from(t.screens).where(eq(t.screens.orgId, org.id));
const [movie] = await db.insert(t.movies).values({ orgId: org.id, title: 'Test', lang: 'Telugu', cert: 'U', mins: 120 }).returning();
const mkShow = (slot: string) => db.transaction(tx => createShowTx(tx, {
  orgId: org.id, screenId: screen.id, layout: screen.layout, settings: org.settings, timezone: org.timezone,
  movieId: movie.id, date: addDaysKey(dateKeyIn(org.timezone), 1), slot, prices: { second: 11000, first: 15000, balcony: 20000 }, opens: 'now',
}));
const show = await mkShow('first');
const hold = (seats: string[], channel: 'online' | 'counter' = 'online') => holdSeats(db, { orgId: org.id, showId: show.id, seats, channel });

try {
  console.log(`Driver: ${process.env.DATABASE_URL ? 'Postgres' : 'PGlite (serialised)'}\n`);

  // 1. 100 buyers, online and at the counter, all want F10 at the same moment.
  {
    const rs = await settle(Array.from({ length: 100 }, (_, i) => hold(['F10'], i % 3 ? 'online' : 'counter')));
    const wins = rs.filter(r => r.status === 'fulfilled');
    check(wins.length === 1, `100 simultaneous holds on one seat -> exactly 1 winner (got ${wins.length})`);
    check(rs.filter(r => reason(r) === 'SEATS_TAKEN').length === 99, '...and the other 99 are told SEATS_TAKEN');
  }

  // 2. 60 groups grabbing overlapping blocks of 3 in row G. No seat may appear in two winning holds.
  {
    const rs = await settle(Array.from({ length: 60 }, (_, i) => { const s = 1 + (i % 16); return hold([`G${s}`, `G${s + 1}`, `G${s + 2}`]); }));
    const won = rs.flatMap(r => r.status === 'fulfilled' ? r.value.seats : []);
    check(new Set(won).size === won.length, `60 overlapping group holds -> no seat in two holds (${won.length} seats held by ${rs.filter(r => r.status === 'fulfilled').length} groups)`);
    const unexpected = rs.filter(r => r.status === 'rejected' && reason(r) !== 'SEATS_TAKEN');
    check(unexpected.length === 0, `...losers only ever see SEATS_TAKEN (unexpected: ${unexpected.map(reason).join(', ') || 'none'})`);
  }

  // 3. Deadlock bait: half the buyers ask for [H1,H2], half for [H2,H1].
  {
    const rs = await settle(Array.from({ length: 40 }, (_, i) => hold(i % 2 ? ['H1', 'H2'] : ['H2', 'H1'])));
    check(rs.filter(r => r.status === 'fulfilled').length === 1, 'Opposite-order requests for the same pair -> 1 winner, no deadlock errors');
  }

  // 4. A hold that runs out goes back on sale, and the original holder can no longer confirm it.
  {
    const a = await hold(['J5']);
    await db.execute(sql`UPDATE show_seats SET held_until = now() - interval '1 second' WHERE booking_id = ${a.bookingId}`);
    await db.execute(sql`UPDATE bookings SET expires_at = now() - interval '1 second' WHERE id = ${a.bookingId}`);
    const b = await hold(['J5']);
    check(b.seats[0] === 'J5', 'Expired hold: J5 can be held by the next buyer');
    const late = await settle([confirmBooking(db, { orgId: org.id, bookingId: a.bookingId, payMethod: 'upi' })]);
    check(reason(late[0]) === 'HOLD_EXPIRED', `...and the first buyer's late confirm is refused (${reason(late[0])})`);
    const ok = await confirmBooking(db, { orgId: org.id, bookingId: b.bookingId, payMethod: 'upi' });
    check(ok.status === 'confirmed', '...while the second buyer confirms');
  }

  // 5. Confirming the same booking 20 times at once makes one set of tickets.
  {
    const a = await hold(['K3', 'K4']);
    await settle(Array.from({ length: 20 }, () => confirmBooking(db, { orgId: org.id, bookingId: a.bookingId, payMethod: 'cash' })));
    const [{ n }] = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM tickets WHERE booking_id = ${a.bookingId}`)).rows;
    check(n === 2, `20 simultaneous confirms of one booking -> 2 tickets, not ${n}`);
  }

  // 6. Database backstop: a second valid ticket for a sold seat is rejected by Postgres itself.
  {
    const [tk] = await db.select().from(t.tickets).where(eq(t.tickets.showId, show.id)).limit(1);
    const dup = await settle([db.insert(t.tickets).values({ orgId: org.id, bookingId: tk.bookingId, showId: show.id, seatId: tk.seatId, cls: tk.cls, pricePaise: 1 })]);
    check(dup[0].status === 'rejected', `Raw INSERT of a duplicate valid ticket for ${tk.seatId} is rejected by the unique index`);
  }

  // 7. Refund puts the seat back on sale; it can then be sold exactly once more.
  {
    const a = await hold(['L7']); await confirmBooking(db, { orgId: org.id, bookingId: a.bookingId, payMethod: 'upi' });
    await refundBooking(db, org.id, a.bookingId, 'test', 'test');
    const rs = await settle(Array.from({ length: 30 }, () => hold(['L7'])));
    check(rs.filter(r => r.status === 'fulfilled').length === 1, 'Refunded seat is resold to exactly 1 of 30 buyers');
  }

  // 8. Two gates scan the same ticket at once: one lets them in, the other says already used.
  {
    const a = await hold(['D1']); const b = await confirmBooking(db, { orgId: org.id, bookingId: a.bookingId, payMethod: 'cash' });
    const rs = await Promise.all(Array.from({ length: 10 }, () => checkIn(db, org.id, show.id, b.code)));
    check(rs.filter(r => r.ok).length === 1, `10 simultaneous scans of one ticket -> 1 entry (${rs.filter(r => r.ok).length})`);
  }

  // 9. Invariant over the whole show: every booked seat has exactly one valid ticket, and vice versa.
  {
    const [{ bad }] = (await db.execute<{ bad: number }>(sql`
      SELECT count(*)::int AS bad FROM show_seats ss
      FULL JOIN (SELECT * FROM tickets WHERE status = 'valid') tk ON tk.show_id = ss.show_id AND tk.seat_id = ss.seat_id
      WHERE (ss.show_id = ${show.id} OR tk.show_id = ${show.id})
        AND ((ss.status = 'booked') IS DISTINCT FROM (tk.id IS NOT NULL) OR ss.booking_id IS DISTINCT FROM tk.booking_id AND ss.status = 'booked')`)).rows;
    check(bad === 0, `Booked seats and valid tickets match one-to-one (${bad} mismatches)`);
  }
} finally {
  // Remove the test theatre.
  for (const q of [
    sql`DELETE FROM tickets WHERE org_id = ${org.id}`, sql`DELETE FROM payments WHERE org_id = ${org.id}`,
    sql`DELETE FROM show_seats WHERE org_id = ${org.id}`, sql`DELETE FROM bookings WHERE org_id = ${org.id}`,
    sql`DELETE FROM shows WHERE org_id = ${org.id}`, sql`DELETE FROM movies WHERE org_id = ${org.id}`,
    sql`DELETE FROM staff WHERE org_id = ${org.id}`, sql`DELETE FROM screens WHERE org_id = ${org.id}`,
    sql`DELETE FROM audit_log WHERE org_id = ${org.id}`, sql`DELETE FROM organizations WHERE id = ${org.id}`,
  ]) await db.execute(q);
  await closeDb();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
