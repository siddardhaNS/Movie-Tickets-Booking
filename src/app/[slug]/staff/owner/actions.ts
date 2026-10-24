'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { movies, organizations, payments, screens, shows, staff } from '@/db/schema';
import { CAN, requireStaff } from '@/lib/auth';
import { getMainScreen, orgOr404 } from '@/lib/tenant';
import { BookingError, cancelShow, refundBooking, toggleBlock } from '@/lib/booking';
import { applyLayoutToUpcoming, audit, createShowTx, hashSecret } from '@/lib/orgs';
import { gateway } from '@/lib/payments';
import { fmtDate, fmtTime, inr, inr2, mask } from '@/lib/format';
import { ROLE_LABEL, type Layout, type Role } from '@/lib/types';

const go = (path: string, params: Record<string, string> = {}) => redirect(`${path}${Object.keys(params).length ? '?' + new URLSearchParams(params) : ''}`);

async function ctx(slug: string, roles: Role[]) {
  const org = await orgOr404(slug);
  const me = await requireStaff(org.id, slug, roles);
  return { org, me, db: await getDb(), base: `/${slug}/staff/owner` };
}

/* ---------- shows ---------- */

export async function saveShow(slug: string, form: FormData) {
  const { org, me, db, base } = await ctx(slug, CAN.manage);
  const id = String(form.get('id') ?? ''), movieId = String(form.get('movieId') ?? ''), opens = String(form.get('opens') ?? 'now') as 'now' | 'd1' | 'd2';
  const prices = Object.fromEntries(org.settings.classes.map(c => [c.key, Math.max(0, Math.round(Number(form.get(`price_${c.key}`)) * 100) || c.defaultPricePaise)]));
  const [m] = await db.select().from(movies).where(and(eq(movies.id, movieId), eq(movies.orgId, org.id)));
  if (!m || !['now', 'd1', 'd2'].includes(opens)) go(`${base}/shows`, { error: 'Pick a movie.' });
  const priceText = org.settings.classes.map(c => `${c.name} ${inr(prices[c.key])}`).join(' · ');
  if (id) {
    const [s] = await db.select().from(shows).where(and(eq(shows.id, id), eq(shows.orgId, org.id)));
    if (!s || s.status !== 'open' || s.startsAt.getTime() <= Date.now()) go(`${base}/shows`, { error: 'This show can no longer be changed.' });
    await db.update(shows).set({ movieId, prices, opens }).where(eq(shows.id, id));
    await audit(db, org.id, me.name, `Updated ${m!.title}, ${fmtDate(s!.date)} ${fmtTime(org.settings.slots.find(x => x.key === s!.slot)!.time)}`, priceText);
  } else {
    const date = String(form.get('date')), slot = String(form.get('slot'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !org.settings.slots.some(s => s.key === slot)) go(`${base}/shows`, { error: 'Pick a day and show time.' });
    const screen = await getMainScreen(org.id);
    try {
      await db.transaction(tx => createShowTx(tx, { orgId: org.id, screenId: screen.id, layout: screen.layout, settings: org.settings, timezone: org.timezone, movieId, date, slot, prices, opens }));
    } catch { go(`${base}/shows`, { error: 'There is already a show at that time.' }); }
    await audit(db, org.id, me.name, `Added a show of ${m!.title}`, `${fmtDate(date)} ${fmtTime(org.settings.slots.find(x => x.key === slot)!.time)} · ${priceText}`);
  }
  revalidatePath(base, 'layout');
  go(`${base}/shows`, { ok: 'Show saved.' });
}

export async function cancelShowAction(slug: string, showId: string) {
  const { org, me, db, base } = await ctx(slug, CAN.manage);
  const r = await showWithTitle(org.id, showId);
  try {
    const n = await cancelShow(db, org.id, showId, me.name);
    await audit(db, org.id, me.name, `Cancelled ${r?.title}, ${r ? fmtDate(r.date) : ''}`, `${n} bookings refunded`);
    go(`${base}/shows`, { ok: `Show cancelled. ${n} bookings were refunded.` });
  } catch (e) { if (e instanceof BookingError) go(`${base}/shows`, { error: e.message }); throw e; }
}

export async function reopenShowAction(slug: string, showId: string) {
  const { org, me, db, base } = await ctx(slug, CAN.manage);
  const [s] = await db.update(shows).set({ status: 'open' }).where(and(eq(shows.id, showId), eq(shows.orgId, org.id))).returning();
  if (s) await audit(db, org.id, me.name, 'Reopened a cancelled show', fmtDate(s.date));
  go(`${base}/shows`, { ok: 'Show reopened for booking.' });
}

async function showWithTitle(orgId: string, showId: string) {
  const db = await getDb();
  const [r] = await db.select({ title: movies.title, date: shows.date }).from(shows).innerJoin(movies, eq(movies.id, shows.movieId)).where(and(eq(shows.id, showId), eq(shows.orgId, orgId)));
  return r;
}

/** Called from the block-seats screen. Returns the new state or an error message. */
export async function toggleBlockAction(slug: string, showId: string, seat: string, reason: string) {
  const { org, db } = await ctx(slug, CAN.manage);
  try { return { status: await toggleBlock(db, org.id, showId, seat, reason.slice(0, 40) || 'Blocked') }; }
  catch (e) { if (e instanceof BookingError) return { error: e.message }; throw e; }
}

export async function finishBlocking(slug: string, showId: string, count: number) {
  const { org, me, db, base } = await ctx(slug, CAN.manage);
  const r = await showWithTitle(org.id, showId);
  await audit(db, org.id, me.name, `Updated blocked seats for ${r?.title}`, `${r ? fmtDate(r.date) : ''} · ${count} seats blocked`);
  go(`${base}/shows`, { ok: 'Blocked seats saved.' });
}

/* ---------- movies ---------- */

const MovieForm = z.object({
  title: z.string().trim().min(2, 'Enter the movie title.').max(80),
  lang: z.string().trim().min(2).max(30),
  cert: z.enum(['U', 'UA', 'A']),
  mins: z.coerce.number().int().min(30).max(300),
  genre: z.string().trim().max(40),
  line: z.string().trim().max(160),
  status: z.enum(['now', 'soon']),
  releaseDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
});

export async function saveMovie(slug: string, form: FormData) {
  const { org, me, db, base } = await ctx(slug, CAN.manage);
  const id = String(form.get('id') ?? '');
  const p = MovieForm.safeParse(Object.fromEntries(form));
  if (!p.success) go(`${base}/movies`, { edit: id || 'new', error: p.error.issues[0].message });
  const d = p.data!;
  if (d.status === 'soon' && !d.releaseDate) go(`${base}/movies`, { edit: id || 'new', error: 'Add a release date for a coming-soon movie.' });
  const data = { ...d, releaseDate: d.releaseDate || null };
  if (id) {
    await db.update(movies).set(data).where(and(eq(movies.id, id), eq(movies.orgId, org.id)));
    await audit(db, org.id, me.name, `Edited movie ${d.title}`);
  } else {
    await db.insert(movies).values({ ...data, orgId: org.id, hue: Math.floor(Math.random() * 360) });
    await audit(db, org.id, me.name, `Added movie ${d.title}`, d.status === 'soon' ? `Coming soon, ${fmtDate(d.releaseDate)}` : 'Now showing');
  }
  revalidatePath(base, 'layout');
  go(`${base}/movies`, { ok: 'Movie saved.' });
}

/* ---------- seat layout ---------- */

const LayoutSchema = z.array(z.object({
  r: z.string().regex(/^[A-Z]{1,2}$/), cls: z.string(), n: z.number().int().min(1).max(40), off: z.array(z.number().int().min(1).max(40)),
})).min(1).max(40);

export async function saveLayout(slug: string, layout: Layout) {
  const { org, me, db } = await ctx(slug, CAN.manage);
  const L = LayoutSchema.parse(layout);
  if (new Set(L.map(r => r.r)).size !== L.length) return { error: 'Two rows have the same letter.' };
  if (L.some(r => !org.settings.classes.some(c => c.key === r.cls))) return { error: 'Unknown seat class.' };
  const screen = await getMainScreen(org.id);
  const count = (x: Layout) => x.reduce((n, r) => n + r.n - r.off.length, 0);
  await db.transaction(async tx => {
    await tx.update(screens).set({ layout: L }).where(eq(screens.id, screen.id));
    await applyLayoutToUpcoming(tx, org.id, screen.id, L);
    await audit(tx, org.id, me.name, 'Changed the seat layout', `${count(screen.layout)} seats before, ${count(L)} after`);
  });
  revalidatePath(`/${slug}`, 'layout');
  return { ok: true };
}

/* ---------- money ---------- */

export async function refundAction(slug: string, bookingId: string, back: string) {
  const { org, me, db } = await ctx(slug, CAN.ownerOnly);
  try {
    const b = await refundBooking(db, org.id, bookingId, me.name, 'Refunded by the owner');
    const [p] = await db.select().from(payments).where(eq(payments.bookingId, b.id));
    if (p) await gateway.refund({ providerRef: p.providerRef, amountPaise: p.amountPaise });
    revalidatePath(`/${slug}`, 'layout');
    redirect(`${back}${back.includes('?') ? '&' : '?'}ok=${encodeURIComponent(`Refund of ${inr2(b.ticketsPaise + b.feesPaise)} started for ${b.code}.`)}`);
  } catch (e) { if (e instanceof BookingError) redirect(`${back}${back.includes('?') ? '&' : '?'}error=${encodeURIComponent(e.message)}`); throw e; }
}

export async function refundOrphanAction(slug: string, paymentId: string) {
  const { org, me, db, base } = await ctx(slug, CAN.ownerOnly);
  const [p] = await db.update(payments).set({ status: 'refunded' })
    .where(and(eq(payments.id, paymentId), eq(payments.orgId, org.id), eq(payments.status, 'needs_refund'))).returning();
  if (p) {
    await gateway.refund({ providerRef: p.providerRef, amountPaise: p.amountPaise });
    await audit(db, org.id, me.name, `Refunded unconfirmed payment of ${inr2(p.amountPaise)}`, p.note ?? '');
  }
  go(base, { ok: p ? `Refund of ${inr2(p.amountPaise)} started.` : 'Already refunded.' });
}

/* ---------- staff ---------- */

export async function addStaff(slug: string, form: FormData) {
  const { org, me, db, base } = await ctx(slug, CAN.ownerOnly);
  const name = String(form.get('name') ?? '').trim(), phone = String(form.get('phone') ?? '').trim(), role = String(form.get('role')) as Role;
  if (name.length < 2) go(`${base}/staff`, { add: '1', error: 'Enter their name.' });
  if (!/^[6-9]\d{9}$/.test(phone)) go(`${base}/staff`, { add: '1', error: 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.' });
  if (!['manager', 'boxoffice', 'gate'].includes(role)) go(`${base}/staff`, { add: '1', error: 'Pick a role.' });
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  try { await db.insert(staff).values({ orgId: org.id, name, phone, role, pinHash: await hashSecret(pin) }); }
  catch { go(`${base}/staff`, { add: '1', error: 'Someone with that mobile number already has a login.' }); }
  await audit(db, org.id, me.name, `Added ${name} as ${ROLE_LABEL[role]}`);
  go(`${base}/staff`, { ok: `${name} added. Their PIN is ${pin}. Share it with them; it won't be shown again.` });
}

export async function resetPin(slug: string, staffId: string) {
  const { org, me, db, base } = await ctx(slug, CAN.ownerOnly);
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const [s] = await db.update(staff).set({ pinHash: await hashSecret(pin) }).where(and(eq(staff.id, staffId), eq(staff.orgId, org.id))).returning();
  if (!s) go(`${base}/staff`);
  await audit(db, org.id, me.name, `Reset PIN for ${s!.name}`);
  go(`${base}/staff`, { ok: `New PIN for ${s!.name} (${mask(s!.phone)}) is ${pin}. It won't be shown again.` });
}

export async function toggleStaff(slug: string, staffId: string) {
  const { org, me, db, base } = await ctx(slug, CAN.ownerOnly);
  const [s] = await db.select().from(staff).where(and(eq(staff.id, staffId), eq(staff.orgId, org.id)));
  if (!s || s.role === 'owner') go(`${base}/staff`);
  await db.update(staff).set({ active: !s!.active }).where(eq(staff.id, staffId));
  await audit(db, org.id, me.name, `${s!.active ? 'Disabled' : 'Enabled'} login for ${s!.name}`, ROLE_LABEL[s!.role]);
  go(`${base}/staff`);
}

/* ---------- settings ---------- */

export async function saveSettings(slug: string, form: FormData) {
  const { org, me, db, base } = await ctx(slug, CAN.ownerOnly);
  const num = (k: string, min: number, max: number) => { const v = Number(form.get(k)); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : NaN; };
  const fee = num('fee', 0, 500), hold = num('hold', 3, 30), chold = num('chold', 1, 15), max = num('max', 1, 20);
  if ([fee, hold, chold, max].some(Number.isNaN)) go(`${base}/settings`, { error: 'Check the numbers.' });
  const slots = org.settings.slots.map(s => {
    const t = String(form.get(`slot_${s.key}`) ?? s.time);
    return { ...s, time: /^\d{2}:\d{2}$/.test(t) ? t : s.time };
  });
  const classes = org.settings.classes.map(c => ({ ...c, defaultPricePaise: Math.round(num(`price_${c.key}`, 0, 5000) * 100) || c.defaultPricePaise }));
  const settings = { ...org.settings, bookingFeePaise: Math.round(fee * 100), holdMinutes: hold, counterHoldMinutes: chold, maxSeats: max, slots, classes };
  await db.update(organizations).set({ settings }).where(eq(organizations.id, org.id));
  await audit(db, org.id, me.name, 'Changed theatre settings', `Booking fee ${inr(settings.bookingFeePaise)} · holds ${hold}/${chold} min · times ${slots.map(s => fmtTime(s.time)).join(', ')}`);
  revalidatePath(`/${slug}`, 'layout');
  go(`${base}/settings`, { ok: 'Settings saved. New show times apply to shows you add from now on.' });
}
