import path from 'node:path';
import fs from 'node:fs';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

type Holder = { db: DB; ready: Promise<void>; close: () => Promise<void>; kind: 'postgres' | 'pglite' };

// Survive Next.js hot reloads in dev: one pool / one PGlite instance per process.
const g = globalThis as unknown as { __ticketDb?: Holder };

export const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

function create(): Holder {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
    return { db: drizzlePg(pool, { schema }), ready: Promise.resolve(), close: () => pool.end(), kind: 'postgres' };
  }
  // Zero-setup dev database. PGlite runs one query at a time, so it is for development only;
  // use Postgres (DATABASE_URL) anywhere real customers book.
  const dir = path.join(process.cwd(), '.data', 'pglite');
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema }) as unknown as DB;
  const ready = (async () => {
    await migratePglite(db as never, { migrationsFolder: MIGRATIONS_DIR });
    const { seedIfEmpty } = await import('./seed');
    await seedIfEmpty(db);
  })();
  return { db, ready, close: () => client.close(), kind: 'pglite' };
}

function holder(): Holder {
  if (!g.__ticketDb) g.__ticketDb = create();
  return g.__ticketDb;
}

export async function getDb(): Promise<DB> {
  const h = holder();
  await h.ready;
  return h.db;
}

export async function closeDb() {
  if (g.__ticketDb) { await g.__ticketDb.close(); g.__ticketDb = undefined; }
}

export { schema };
