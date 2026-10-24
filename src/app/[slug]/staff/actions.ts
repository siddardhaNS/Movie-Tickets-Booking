'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { endStaffSession, startStaffSession } from '@/lib/auth';
import { checkSecret, staffByPhone } from '@/lib/orgs';
import { orgOr404 } from '@/lib/tenant';

// Simple brute-force guard for 4-digit PINs: 5 wrong tries locks that number for 15 minutes.
// Per-process memory; use Redis or a DB table when running more than one server.
const fails = new Map<string, { n: number; until: number }>();

export async function staffLogin(slug: string, form: FormData) {
  const org = await orgOr404(slug);
  const phone = String(form.get('phone') ?? '').replace(/\D/g, ''), pin = String(form.get('pin') ?? '');
  const key = `${org.id}:${phone}`, f = fails.get(key);
  const back = (msg: string) => redirect(`/${slug}/staff/login?error=${encodeURIComponent(msg)}&phone=${phone}`);
  if (f && f.until > Date.now()) back('Too many wrong PINs. Try again in 15 minutes, or ask the owner to reset your PIN.');

  const m = await staffByPhone(await getDb(), org.id, phone);
  if (!m || !m.active || !(await checkSecret(pin, m.pinHash))) {
    const n = (f && f.until <= Date.now() && f.n >= 5 ? 0 : f?.n ?? 0) + 1;
    fails.set(key, { n, until: n >= 5 ? Date.now() + 15 * 60e3 : 0 });
    back(m && !m.active ? 'This login is disabled. Ask the owner.' : 'Mobile number or PIN is wrong.');
  }
  fails.delete(key);
  await startStaffSession(m!.id, org.id);
  redirect(`/${slug}/staff`);
}

export async function staffLogout(slug: string) {
  await endStaffSession();
  redirect(`/${slug}/staff/login`);
}
