import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { platformAdmins, staff } from '@/db/schema';
import type { Role } from './types';

const ADMIN_COOKIE = 'tb_admin';
const STAFF_COOKIE = 'tb_staff';
const DAY = 24 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set in production');
  return new TextEncoder().encode(s || 'dev-only-insecure-session-secret');
}

async function sign(payload: Record<string, unknown>, maxAge: number) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${maxAge}s`).sign(secret());
}

async function read<T>(name: string): Promise<T | null> {
  const token = (await cookies()).get(name)?.value;
  if (!token) return null;
  try { return (await jwtVerify(token, secret())).payload as T; } catch { return null; }
}

const cookieOpts = (maxAge: number) => ({
  httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge,
});

/* ---------- platform admin ---------- */

export async function startAdminSession(adminId: string) {
  (await cookies()).set(ADMIN_COOKIE, await sign({ sub: adminId, kind: 'admin' }, 7 * DAY), cookieOpts(7 * DAY));
}

export async function endAdminSession() { (await cookies()).delete(ADMIN_COOKIE); }

export async function currentAdmin() {
  const s = await read<{ sub: string; kind: string }>(ADMIN_COOKIE);
  if (!s || s.kind !== 'admin') return null;
  const db = await getDb();
  const [a] = await db.select().from(platformAdmins).where(eq(platformAdmins.id, s.sub));
  return a ?? null;
}

export async function requireAdmin() {
  const a = await currentAdmin();
  if (!a) redirect('/admin/login');
  return a;
}

/* ---------- theatre staff ---------- */

export async function startStaffSession(staffId: string, orgId: string) {
  (await cookies()).set(STAFF_COOKIE, await sign({ sub: staffId, org: orgId, kind: 'staff' }, 14 * 60 * 60), cookieOpts(14 * 60 * 60));
}

export async function endStaffSession() { (await cookies()).delete(STAFF_COOKIE); }

/** Re-reads the staff row on every request so disabling a login or changing a role takes effect at once. */
export async function currentStaff(orgId: string) {
  const s = await read<{ sub: string; org: string; kind: string }>(STAFF_COOKIE);
  if (!s || s.kind !== 'staff' || s.org !== orgId) return null;
  const db = await getDb();
  const [m] = await db.select().from(staff).where(and(eq(staff.id, s.sub), eq(staff.orgId, orgId), eq(staff.active, true)));
  return m ?? null;
}

export type StaffMember = NonNullable<Awaited<ReturnType<typeof currentStaff>>>;

/** What each role may do. Owner: everything. Manager: everything except staff, refunds and reports. */
export const CAN = {
  counter: ['owner', 'manager', 'boxoffice'] as Role[],
  gate: ['owner', 'manager', 'gate'] as Role[],
  manage: ['owner', 'manager'] as Role[],
  ownerOnly: ['owner'] as Role[],
};

export async function requireStaff(orgId: string, slug: string, roles: Role[]) {
  const m = await currentStaff(orgId);
  if (!m) redirect(`/${slug}/staff/login`);
  if (!roles.includes(m.role)) redirect(`/${slug}/staff`);
  return m;
}
