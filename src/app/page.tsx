import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { organizations } from '@/db/schema';
import { Header } from '@/components/Header';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const db = await getDb();
  const orgs = await db.select().from(organizations).where(eq(organizations.active, true)).orderBy(asc(organizations.name));
  return (
    <>
      <Header title="Tickets" subtitle="Book movie tickets at your local theatre" logo="TK" href="/"
        right={<Link className="btn sm" href="/admin">Platform admin</Link>} />
      <main className="shell">
        <div className="sec" style={{ marginTop: 8 }}><h2>Pick a theatre</h2></div>
        {orgs.length ? (
          <div className="theatres">
            {orgs.map(o => (
              <Link key={o.id} href={`/${o.slug}`} className="card theatre">
                <p className="eyebrow">{o.city}</p>
                <h3 className="disp" style={{ fontSize: 26, lineHeight: 1 }}>{o.name}</h3>
                <span className="mmeta">{o.address}</span>
                <span className="link">See shows →</span>
              </Link>
            ))}
          </div>
        ) : <div className="empty"><b>No theatres yet</b>A platform admin can add one from the admin console.</div>}
      </main>
    </>
  );
}
