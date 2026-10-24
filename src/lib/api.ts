import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { BookingError } from './booking';
import { getOrgBySlug } from './tenant';
import { currentStaff } from './auth';
import type { Role } from './types';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

const STATUS: Record<string, number> = {
  SEATS_TAKEN: 409, UNKNOWN_SEAT: 400, TOO_MANY: 400, NO_SEATS: 400, SHOW_CLOSED: 409, NOT_OPEN_YET: 409,
  HOLD_EXPIRED: 410, NOT_FOUND: 404, BAD_STATE: 409, PAID_AFTER_EXPIRY: 409,
};

/** Wrap a route handler: maps domain errors to JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof BookingError) return NextResponse.json({ error: e.message, code: e.code, seats: e.seats }, { status: STATUS[e.code] ?? 400 });
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
    }
  };
}

export async function apiOrg(slug: string) {
  const org = await getOrgBySlug(slug);
  if (!org || !org.active) throw new HttpError(404, 'Theatre not found');
  return org;
}

export async function apiStaff(orgId: string, roles: Role[]) {
  const m = await currentStaff(orgId);
  if (!m) throw new HttpError(401, 'Log in again.');
  if (!roles.includes(m.role)) throw new HttpError(403, 'Your role cannot do this.');
  return m;
}
