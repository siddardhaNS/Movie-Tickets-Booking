import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { DB } from './index';
import { auditLog, bookings, movies, organizations, payments, platformAdmins, screens, staff, tickets } from './schema';
import { createOrganization, createShowTx, hashSecret } from '@/lib/orgs';
import { addDaysKey, dateKeyIn } from '@/lib/format';
import { allSeats } from '@/lib/layout';
import { newCode } from '@/lib/booking';

const NAMES = ['Ravi Teja K', 'Lakshmi P', 'Sai Kiran M', 'Anitha R', 'Harsha V', 'Divya M', 'Naresh B', 'Pavani S', 'Kalyan T', 'Sravani G', 'Mahesh Y', 'Keerthi N'];

function rng(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export async function seedIfEmpty(db: DB) {
  const [{ n }] = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM organizations`)).rows;
  if (n === 0 && process.env.SEED_DEMO !== 'false') await seedDemo(db);
}

export async function ensureAdmin(db: DB) {
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const [exists] = await db.select().from(platformAdmins).where(eq(platformAdmins.email, email));
  if (!exists) {
    if (process.env.VERCEL && !process.env.ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in Vercel before the first deploy.');
    await db.insert(platformAdmins).values({ email, name: 'Platform admin', passwordHash: await hashSecret(process.env.ADMIN_PASSWORD || 'admin12345') });
  }
}

export async function seedDemo(db: DB) {
  await ensureAdmin(db);

  const hs = await createOrganization(db, {
    name: 'Hari Shankar Picture Palace', slug: 'harishankar', city: 'Tenali', address: 'Main Road, Tenali',
    ownerName: 'Venkata Rao', ownerPhone: '9848012345', ownerPin: '1234', codePrefix: 'HS',
  }, 'Seed');
  const settings = { ...hs.settings, defaultBlocked: { M1: 'House quota', M2: 'House quota', M13: 'House quota', M14: 'House quota' } };
  await db.update(organizations).set({ settings }).where(eq(organizations.id, hs.id));
  const pin = await hashSecret('1234');
  await db.insert(staff).values([
    { orgId: hs.id, name: 'Suresh Babu', phone: '9848023456', role: 'manager', pinHash: pin },
    { orgId: hs.id, name: 'Ramesh K', phone: '9848034567', role: 'boxoffice', pinHash: pin },
    { orgId: hs.id, name: 'Lakshmi P', phone: '9848045678', role: 'boxoffice', pinHash: pin },
    { orgId: hs.id, name: 'Kiran M', phone: '9848056789', role: 'gate', pinHash: pin },
    { orgId: hs.id, name: 'Anil T', phone: '9848067890', role: 'gate', pinHash: pin, active: false },
  ]);
  const today = dateKeyIn(hs.timezone);
  const mv = await db.insert(movies).values([
    { orgId: hs.id, title: 'Godavari Express', lang: 'Telugu', cert: 'UA', mins: 154, genre: 'Action drama', hue: 12, line: 'A train driver races the monsoon to get one last passenger home.' },
    { orgId: hs.id, title: 'Vennela Rathri', lang: 'Telugu', cert: 'U', mins: 138, genre: 'Romance', hue: 222, line: 'Two strangers keep missing each other on the same moonlit street.' },
    { orgId: hs.id, title: 'Monsoon Signal', lang: 'Hindi', cert: 'UA', mins: 127, genre: 'Thriller', hue: 186, line: 'A radio operator hears a call for help from a ship that sank in 1978.' },
    { orgId: hs.id, title: 'Little Comet', lang: 'English', cert: 'U', mins: 98, genre: 'Animation', hue: 276, line: 'A tiny comet runs away from the sky to find out what rain feels like.' },
    { orgId: hs.id, title: 'Kotha Sankranti', lang: 'Telugu', cert: 'U', mins: 146, genre: 'Family drama', hue: 38, status: 'soon', releaseDate: addDaysKey(today, 9), line: 'Three brothers come home for the festival after ten years apart.' },
    { orgId: hs.id, title: 'Palnadu Rising', lang: 'Telugu', cert: 'UA', mins: 158, genre: 'Action', hue: 350, status: 'soon', releaseDate: addDaysKey(today, 16), line: 'A village kabaddi team takes on the district champions.' },
  ]).returning();
  await seedShows(db, hs.id, settings, mv.map(m => m.id), 1);

  // A second, independent theatre to show tenants are isolated from each other.
  const sv = await createOrganization(db, {
    name: 'Sri Venkateswara Cinema', slug: 'venkateswara', city: 'Guntur', address: 'Brodipet, Guntur',
    ownerName: 'Prasad G', ownerPhone: '9000011111', ownerPin: '1234', codePrefix: 'SV',
  }, 'Seed');
  const mv2 = await db.insert(movies).values([
    { orgId: sv.id, title: 'Monsoon Signal', lang: 'Hindi', cert: 'UA', mins: 127, genre: 'Thriller', hue: 186, line: 'A radio operator hears a call for help from a ship that sank in 1978.' },
    { orgId: sv.id, title: 'Kadali Theeram', lang: 'Telugu', cert: 'U', mins: 141, genre: 'Drama', hue: 160, line: 'A fisherman’s daughter builds the boat her father never could.' },
  ]).returning();
  await seedShows(db, sv.id, sv.settings, [mv2[1].id, mv2[0].id, mv2[1].id, mv2[0].id], 2);
}

async function seedShows(db: DB, orgId: string, settings: typeof organizations.$inferSelect.settings, movieIds: string[], salt: number) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const [screen] = await db.select().from(screens).where(eq(screens.orgId, orgId));
  const counterStaff = (await db.select().from(staff).where(eq(staff.orgId, orgId))).filter(s => s.role === 'boxoffice' || s.role === 'owner');
  const today = dateKeyIn(org.timezone);
  const seats = allSeats(screen.layout);
  const clsOf = new Map(screen.layout.map(r => [r.r, r.cls]));
  const base: Record<string, number> = { morning: .26, matinee: .46, first: .63, second: .74 };
  let refunded = false;

  for (let d = -3; d <= 6; d++) {
    const date = addDaysKey(today, d);
    const plan = [movieIds[Math.abs(d) % 2 ? 1 : 3] ?? movieIds[0], movieIds[0], movieIds[2] ?? movieIds[0], movieIds[0]];
    for (const [i, sl] of settings.slots.entries()) {
      const prices = Object.fromEntries(settings.classes.map(c => [c.key, c.defaultPricePaise]));
      const show = await db.transaction(tx => createShowTx(tx, {
        orgId, screenId: screen.id, layout: screen.layout, settings, timezone: org.timezone,
        movieId: plan[i], date, slot: sl.key, prices, opens: 'now',
      }));
      const r = rng(salt * 1e6 + (d + 10) * 100 + i);
      let occ = (base[sl.key] ?? .5) * (d < 0 ? 1.04 : Math.max(.12, 1 - d * .19));
      if (d === 0 && sl.key === 'second') occ = .9;
      occ = Math.min(occ, .96);
      const taken = new Set(Object.keys(settings.defaultBlocked));
      const target = Math.round((seats.length - taken.size) * occ);
      const started = show.startsAt.getTime() < Date.now();
      const bRows: (typeof bookings.$inferInsert)[] = [], tRows: (typeof tickets.$inferInsert)[] = [];
      let sold = 0, tries = 0;
      while (sold < target && tries++ < 5000) {
        const sid = seats[Math.floor(r() * seats.length)];
        if (taken.has(sid)) continue;
        const row = sid.match(/^[A-Z]+/)![0], n = Number(sid.slice(row.length)), size = 1 + Math.floor(r() * 4), pick: string[] = [];
        for (let j = 0; j < size; j++) { const x = row + (n + j); if (seats.includes(x) && !taken.has(x)) pick.push(x); else break; }
        if (!pick.length) continue;
        pick.forEach(x => taken.add(x)); sold += pick.length;
        const online = r() < .68, id = randomUUID();
        const ticketsPaise = pick.reduce((a, x) => a + prices[clsOf.get(x.match(/^[A-Z]+/)![0])!], 0);
        const at = new Date(show.startsAt.getTime() - (online ? Math.floor(r() * 3 * 864e5) + 36e5 : Math.floor(r() * 3 * 36e5) + 6e5));
        const nm = NAMES[Math.floor(r() * NAMES.length)];
        bRows.push({
          id, orgId, showId: show.id, code: newCode(settings.codePrefix), channel: online ? 'online' : 'counter', status: 'confirmed',
          seats: pick, prices, name: online ? nm : 'Walk-in', phone: online ? '9' + String(Math.floor(r() * 1e9)).padStart(9, '0') : '',
          payMethod: online ? (r() < .62 ? 'upi' : r() < .7 ? 'card' : 'nb') : (r() < .55 ? 'cash' : 'upi'),
          staffId: online ? null : counterStaff[Math.floor(r() * counterStaff.length)]?.id ?? null,
          ticketsPaise, feesPaise: online ? Math.round(pick.length * settings.bookingFeePaise * (1 + settings.gstRate)) : 0,
          expiresAt: at, confirmedAt: at, createdAt: at,
          checkedInAt: started && r() < .96 ? new Date(show.startsAt.getTime() - Math.floor(r() * 25 * 60e3)) : null,
        });
        pick.forEach(x => tRows.push({ orgId, bookingId: id, showId: show.id, seatId: x, cls: clsOf.get(x.match(/^[A-Z]+/)![0])!, pricePaise: prices[clsOf.get(x.match(/^[A-Z]+/)![0])!] }));
      }
      if (!bRows.length) continue;
      await db.insert(bookings).values(bRows);
      await db.insert(tickets).values(tRows);
      const map = bRows.flatMap(b => b.seats.map(s => ({ seat_id: s, booking_id: b.id })));
      await db.execute(sql`
        UPDATE show_seats ss SET status = 'booked', booking_id = x.booking_id
        FROM jsonb_to_recordset(${JSON.stringify(map)}::jsonb) AS x(seat_id text, booking_id uuid)
        WHERE ss.show_id = ${show.id} AND ss.seat_id = x.seat_id`);
      const onlineRows = bRows.filter(b => b.channel === 'online');
      if (onlineRows.length) await db.insert(payments).values(onlineRows.map(b => ({
        orgId, bookingId: b.id!, provider: 'mock', providerRef: `seed_${b.code}`, method: b.payMethod!, amountPaise: b.ticketsPaise + b.feesPaise, status: 'captured' as const, createdAt: b.createdAt,
      })));

      if (!refunded && d === -1 && onlineRows[0]) {
        refunded = true;
        const b = onlineRows[0];
        await db.update(bookings).set({ status: 'refunded', refundedAt: new Date(b.createdAt!.getTime() + 36e5), refundReason: 'Customer was charged twice by the bank', checkedInAt: null }).where(eq(bookings.id, b.id!));
        await db.execute(sql`UPDATE tickets SET status = 'void' WHERE booking_id = ${b.id}`);
        await db.execute(sql`UPDATE show_seats SET status = 'available', booking_id = NULL WHERE booking_id = ${b.id}`);
        await db.execute(sql`UPDATE payments SET status = 'refunded' WHERE booking_id = ${b.id}`);
        await db.insert(auditLog).values({ orgId, actor: 'Seed', action: `Refunded booking ${b.code}`, detail: 'Customer was charged twice by the bank' });
      }
      if (d === 0 && i === 0 && salt === 1) {
        // An unconfirmed payment for the owner to sort out (the "Needs your attention" card).
        const [pb] = await db.insert(bookings).values({
          orgId, showId: show.id, code: newCode(settings.codePrefix), channel: 'online', status: 'released', seats: ['C9', 'C10'], prices,
          name: 'Bhavana L', phone: '9701234567', ticketsPaise: 2 * prices.second, feesPaise: Math.round(2 * settings.bookingFeePaise * (1 + settings.gstRate)),
          expiresAt: new Date(Date.now() - 3.2 * 36e5),
        }).returning();
        await db.insert(payments).values({
          orgId, bookingId: pb.id, provider: 'mock', providerRef: `seed_late_${pb.code}`, method: 'upi', amountPaise: pb.ticketsPaise + pb.feesPaise,
          status: 'needs_refund', note: 'Money received after the seats were released. Booking was not confirmed.', createdAt: new Date(Date.now() - 3.2 * 36e5),
        });
      }
    }
  }
}
