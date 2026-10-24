// Apply SQL migrations in ./drizzle to the database in DATABASE_URL (PGlite migrates itself on startup).
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url && process.env.VERCEL) {
  // Print only the names (never values) so a mis-scoped or prefixed variable is easy to spot in the build log.
  const seen = Object.keys(process.env).filter(k => /DATABASE|POSTGRES|^PG/.test(k));
  console.error(`DATABASE_URL is not set for the "${process.env.VERCEL_ENV}" environment. Database-like variables visible: ${seen.join(", ") || "none"}.`);
  console.error("Add a Postgres database (e.g. Neon) to this Vercel project for this environment, then redeploy.");
  process.exit(1);
}
if (!url) { console.log('DATABASE_URL is not set: the embedded dev database migrates itself when the app starts.'); process.exit(0); }
const pool = new pg.Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
await pool.end();
console.log('Migrations applied.');
