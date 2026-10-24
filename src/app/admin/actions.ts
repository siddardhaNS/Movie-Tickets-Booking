'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { organizations, platformAdmins } from '@/db/schema';
import { endAdminSession, requireAdmin, startAdminSession } from '@/lib/auth';
import { checkSecret, createOrganization } from '@/lib/orgs';
import { RESERVED_SLUGS } from '@/lib/tenant';

const back = (path: string, key: 'error' | 'ok', msg: string) => redirect(`${path}?${key}=${encodeURIComponent(msg)}`);

export async function adminLogin(form: FormData) {
  const email = String(form.get('email') ?? '').trim().toLowerCase(), password = String(form.get('password') ?? '');
  const db = await getDb();
  const [a] = await db.select().from(platformAdmins).where(eq(platformAdmins.email, email));
  if (!a || !(await checkSecret(password, a.passwordHash))) back('/admin/login', 'error', 'Email or password is wrong.');
  await startAdminSession(a!.id);
  redirect('/admin');
}

export async function adminLogout() {
  await endAdminSession();
  redirect('/admin/login');
}

const NewOrg = z.object({
  name: z.string().trim().min(3, 'Enter the theatre name.').max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'Web address: 3–40 lowercase letters, numbers or dashes.'),
  city: z.string().trim().min(2, 'Enter the city.').max(60),
  address: z.string().trim().max(160),
  codePrefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Ticket prefix: exactly 2 letters.'),
  ownerName: z.string().trim().min(2, "Enter the owner's name.").max(80),
  ownerPhone: z.string().trim().regex(/^[6-9]\d{9}$/, "Owner's mobile: 10 digits starting with 6–9."),
  ownerPin: z.string().trim().regex(/^\d{4,6}$/, 'Owner PIN: 4 to 6 digits.'),
});

export async function createOrg(form: FormData) {
  const admin = await requireAdmin();
  const parsed = NewOrg.safeParse(Object.fromEntries(form));
  if (!parsed.success) back('/admin', 'error', parsed.error.issues[0].message);
  const input = parsed.data!;
  if (RESERVED_SLUGS.has(input.slug)) back('/admin', 'error', `"${input.slug}" is reserved. Pick another web address.`);
  const db = await getDb();
  const [taken] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, input.slug));
  if (taken) back('/admin', 'error', `/${input.slug} is already used by another theatre.`);
  await createOrganization(db, input, admin.name);
  revalidatePath('/admin');
  back('/admin', 'ok', `${input.name} is live at /${input.slug}. The owner logs in with ${input.ownerPhone} and their PIN.`);
}

export async function setOrgActive(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id')), active = form.get('active') === '1';
  const db = await getDb();
  await db.update(organizations).set({ active }).where(eq(organizations.id, id));
  revalidatePath('/admin');
}

export async function setOrgStyle(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id')), style = String(form.get('style'));
  if (!['marquee', 'poster', 'calm'].includes(style)) return;
  const db = await getDb();
  const [o] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!o) return;
  await db.update(organizations).set({ settings: { ...o.settings, style: style as 'marquee' } }).where(eq(organizations.id, id));
  revalidatePath('/admin');
}
