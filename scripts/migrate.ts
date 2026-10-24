// Apply SQL migrations in ./drizzle to the database in DATABASE_URL (PGlite migrates itself on startup).
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.log('DATABASE_URL is not set: the embedded dev database migrates itself when the app starts.'); process.exit(0); }
const pool = new pg.Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
await pool.end();
console.log('Migrations applied.');
