import { cache } from 'react';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { organizations, screens } from '@/db/schema';

// Paths at the top level that can never be a theatre's slug.
export const RESERVED_SLUGS = new Set(['admin', 'api', 'staff', '_next', 'login', 'logout', 'static', 'public', 'favicon.ico', 'robots.txt']);

export const getOrgBySlug = cache(async (slug: string) => {
  const db = await getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug.toLowerCase()));
  return org ?? null;
});

export type Org = NonNullable<Awaited<ReturnType<typeof getOrgBySlug>>>;

/** Resolve the tenant for a page, 404 if it doesn't exist or is suspended. */
export async function orgOr404(slug: string): Promise<Org> {
  const org = await getOrgBySlug(slug);
  if (!org || !org.active) notFound();
  return org;
}

export const getMainScreen = cache(async (orgId: string) => {
  const db = await getDb();
  const [s] = await db.select().from(screens).where(eq(screens.orgId, orgId)).orderBy(screens.createdAt).limit(1);
  return s;
});
