// Create the platform admin and the demo theatres, if the database is empty.
import { getDb, closeDb } from '@/db';
import { ensureAdmin, seedIfEmpty } from '@/db/seed';

const db = await getDb();
await ensureAdmin(db);
await seedIfEmpty(db);
await closeDb();
console.log('Seed done.');
