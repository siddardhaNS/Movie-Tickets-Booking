import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, integer, boolean, timestamp, date, jsonb, primaryKey, uniqueIndex, index, check,
} from 'drizzle-orm/pg-core';
import type { Layout, OrgSettings, Prices } from '@/lib/types';

/*
 * Multi-tenancy: one shared database, every tenant-owned row carries org_id and every query
 * filters on it (see src/lib/tenant.ts). An organization is one theatre.
 *
 * No-double-booking guarantee, two independent layers:
 *  1. show_seats has exactly one row per (show, seat). Holding or selling a seat is a conditional
 *     UPDATE on that row (src/lib/booking.ts), so two buyers can never both flip it.
 *  2. tickets has a partial UNIQUE index on (show_id, seat_id) for valid tickets. Even if the
 *     application logic had a bug, Postgres rejects a second valid ticket for the same seat.
 */

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable('organizations', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  city: text('city').notNull().default(''),
  address: text('address').notNull().default(''),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  settings: jsonb('settings').$type<OrgSettings>().notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const platformAdmins = pgTable('platform_admins', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAt(),
});

export const staff = pgTable('staff', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  role: text('role', { enum: ['owner', 'manager', 'boxoffice', 'gate'] }).notNull(),
  pinHash: text('pin_hash').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
}, t => [uniqueIndex('staff_org_phone').on(t.orgId, t.phone)]);

export const screens = pgTable('screens', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  layout: jsonb('layout').$type<Layout>().notNull(),
  createdAt: createdAt(),
}, t => [index('screens_org').on(t.orgId)]);

export const movies = pgTable('movies', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  lang: text('lang').notNull(),
  cert: text('cert').notNull(),
  mins: integer('mins').notNull(),
  genre: text('genre').notNull().default(''),
  line: text('line').notNull().default(''),
  hue: integer('hue').notNull().default(20),
  status: text('status', { enum: ['now', 'soon'] }).notNull().default('now'),
  releaseDate: date('release_date', { mode: 'string' }),
  createdAt: createdAt(),
}, t => [index('movies_org').on(t.orgId)]);

export const shows = pgTable('shows', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  screenId: uuid('screen_id').notNull().references(() => screens.id),
  movieId: uuid('movie_id').notNull().references(() => movies.id),
  date: date('date', { mode: 'string' }).notNull(),
  slot: text('slot').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  prices: jsonb('prices').$type<Prices>().notNull(),
  opens: text('opens', { enum: ['now', 'd1', 'd2'] }).notNull().default('now'),
  status: text('status', { enum: ['open', 'cancelled'] }).notNull().default('open'),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('shows_screen_slot').on(t.screenId, t.date, t.slot),
  index('shows_org_date').on(t.orgId, t.date),
]);

export const bookings = pgTable('bookings', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  showId: uuid('show_id').notNull().references(() => shows.id),
  code: text('code').notNull(),
  channel: text('channel', { enum: ['online', 'counter'] }).notNull(),
  // pending = seats held while the customer pays; released = hold given up or timed out.
  status: text('status', { enum: ['pending', 'confirmed', 'released', 'refunded'] }).notNull(),
  seats: jsonb('seats').$type<string[]>().notNull(),
  prices: jsonb('prices').$type<Prices>().notNull(), // snapshot at hold time, so the price paid is the price shown
  name: text('name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  payMethod: text('pay_method'),
  payRef: text('pay_ref'),
  staffId: uuid('staff_id').references(() => staff.id),
  ticketsPaise: integer('tickets_paise').notNull(),
  feesPaise: integer('fees_paise').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  refundReason: text('refund_reason'),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('bookings_org_code').on(t.orgId, t.code),
  index('bookings_show').on(t.showId),
  index('bookings_org_created').on(t.orgId, t.createdAt),
]);

// One row per seat per show. The single source of truth for who has a seat right now.
export const showSeats = pgTable('show_seats', {
  showId: uuid('show_id').notNull().references(() => shows.id),
  seatId: text('seat_id').notNull(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  cls: text('cls').notNull(),
  status: text('status', { enum: ['available', 'held', 'booked', 'blocked'] }).notNull().default('available'),
  bookingId: uuid('booking_id').references(() => bookings.id),
  heldUntil: timestamp('held_until', { withTimezone: true }),
  blockReason: text('block_reason'),
}, t => [
  primaryKey({ columns: [t.showId, t.seatId] }),
  index('show_seats_booking').on(t.bookingId),
  check('show_seats_held_has_booking', sql`${t.status} NOT IN ('held','booked') OR ${t.bookingId} IS NOT NULL`),
  check('show_seats_held_has_expiry', sql`${t.status} <> 'held' OR ${t.heldUntil} IS NOT NULL`),
]);

export const tickets = pgTable('tickets', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  showId: uuid('show_id').notNull().references(() => shows.id),
  seatId: text('seat_id').notNull(),
  cls: text('cls').notNull(),
  pricePaise: integer('price_paise').notNull(),
  status: text('status', { enum: ['valid', 'void'] }).notNull().default('valid'),
  createdAt: createdAt(),
}, t => [
  // The database-level guarantee: at most one valid ticket per seat per show.
  uniqueIndex('tickets_one_valid_per_seat').on(t.showId, t.seatId).where(sql`${t.status} = 'valid'`),
  index('tickets_booking').on(t.bookingId),
]);

export const payments = pgTable('payments', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref').notNull(),
  method: text('method').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  // needs_refund = money arrived after the seat hold ran out, so no booking was made.
  status: text('status', { enum: ['captured', 'refunded', 'needs_refund'] }).notNull(),
  note: text('note'),
  createdAt: createdAt(),
}, t => [
  uniqueIndex('payments_provider_ref').on(t.provider, t.providerRef),
  index('payments_org_status').on(t.orgId, t.status),
]);

export const auditLog = pgTable('audit_log', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  detail: text('detail').notNull().default(''),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('audit_org_at').on(t.orgId, t.at)]);
