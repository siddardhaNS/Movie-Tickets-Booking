import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { organizations } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { Header } from '@/components/Header';
import { inr } from '@/lib/format';
import { adminLogout, createOrg, setOrgActive, setOrgStyle } from './actions';

export const metadata: Metadata = { title: 'Theatres' };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const admin = await requireAdmin();
  const { error, ok } = await searchParams;
  const db = await getDb();
  const orgs = await db.select().from(organizations).orderBy(asc(organizations.createdAt));
  const stats = (await db.execute<{ org_id: string; tickets: number; paise: number; staff: number; upcoming: number }>(sql`
    SELECT o.id AS org_id,
      (SELECT coalesce(sum(jsonb_array_length(b.seats)), 0)::int FROM bookings b WHERE b.org_id = o.id AND b.status = 'confirmed' AND b.confirmed_at > now() - interval '7 days') AS tickets,
      (SELECT coalesce(sum(b.tickets_paise), 0)::int FROM bookings b WHERE b.org_id = o.id AND b.status = 'confirmed' AND b.confirmed_at > now() - interval '7 days') AS paise,
      (SELECT count(*)::int FROM staff s WHERE s.org_id = o.id AND s.active) AS staff,
      (SELECT count(*)::int FROM shows s WHERE s.org_id = o.id AND s.status = 'open' AND s.starts_at > now()) AS upcoming
    FROM organizations o`)).rows;
  const st = new Map(stats.map(s => [s.org_id, s]));

  return (
    <>
      <Header title="Platform admin" subtitle={`Signed in as ${admin.email}`} logo="TK" href="/admin"
        right={<form action={adminLogout}><button className="btn sm" type="submit">Log out</button></form>} />
      <main className="shell">
        <div className="ohead" style={{ marginBottom: 16 }}>
          <div><p className="eyebrow">{orgs.length} theatres</p><h1>Theatres</h1></div>
        </div>
        {error ? <div className="banner" role="alert" style={{ marginBottom: 16 }}>{error}</div> : null}
        {ok ? <div className="card" role="status" style={{ padding: '12px 16px', marginBottom: 16, color: 'var(--ok)', fontWeight: 700 }}>{ok}</div> : null}

        <section className="card hcard" style={{ marginBottom: 20 }}>
          <div className="tablewrap"><table className="t">
            <thead><tr><th>Theatre</th><th>Web address</th><th className="r">Upcoming shows</th><th className="r">Tickets, 7 days</th><th className="r">Collection, 7 days</th><th className="r">Staff</th><th>Look</th><th>Status</th></tr></thead>
            <tbody>
              {orgs.map(o => {
                const s = st.get(o.id);
                return (
                  <tr key={o.id}>
                    <td><b>{o.name}</b><span className="sub">{o.city} · ticket codes {o.settings.codePrefix}…</span></td>
                    <td><Link className="link mono" href={`/${o.slug}`}>/{o.slug}</Link><span className="sub"><Link className="link" href={`/${o.slug}/staff/login`}>Staff login</Link></span></td>
                    <td className="r num">{s?.upcoming ?? 0}</td>
                    <td className="r num">{s?.tickets ?? 0}</td>
                    <td className="r num">{inr(s?.paise ?? 0)}</td>
                    <td className="r num">{s?.staff ?? 0}</td>
                    <td>
                      <form action={setOrgStyle} style={{ display: 'flex', gap: 6 }}>
                        <input type="hidden" name="id" value={o.id} />
                        <select className="inp" name="style" defaultValue={o.settings.style ?? 'marquee'} style={{ padding: '6px 10px', fontSize: 13, width: 'auto' }}>
                          <option value="marquee">Marquee</option><option value="poster">Poster</option><option value="calm">Calm</option>
                        </select>
                        <button className="btn sm" type="submit">Set</button>
                      </form>
                    </td>
                    <td>
                      <form action={setOrgActive}>
                        <input type="hidden" name="id" value={o.id} /><input type="hidden" name="active" value={o.active ? '0' : '1'} />
                        {o.active ? <span className="pill ok">Live</span> : <span className="pill bad">Suspended</span>}{' '}
                        <button className={`btn sm ${o.active ? 'danger' : ''}`} type="submit">{o.active ? 'Suspend' : 'Reactivate'}</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </section>

        <section className="card panel" style={{ maxWidth: 760 }}>
          <div><h2 className="disp" style={{ fontSize: 28 }}>Add a theatre</h2>
            <p className="note">Creates the theatre with one screen (default 178-seat layout the owner can change), four daily show times, and an owner login.</p></div>
          <form className="stack" action={createOrg}>
            <div className="twocol">
              <label className="f">Theatre name<input className="inp" name="name" placeholder="e.g. Sri Lakshmi Talkies" required /></label>
              <label className="f">Web address<input className="inp mono" name="slug" placeholder="e.g. srilakshmi" required /></label>
            </div>
            <div className="twocol">
              <label className="f">City<input className="inp" name="city" required /></label>
              <label className="f">Ticket code prefix<input className="inp mono" name="codePrefix" maxLength={2} placeholder="e.g. SL" required /></label>
            </div>
            <label className="f">Address<input className="inp" name="address" /></label>
            <div className="fgrid">
              <label className="f">Owner name<input className="inp" name="ownerName" required /></label>
              <label className="f">Owner mobile<input className="inp" name="ownerPhone" inputMode="numeric" maxLength={10} required /></label>
              <label className="f">Owner PIN<input className="inp" name="ownerPin" inputMode="numeric" maxLength={6} required /></label>
            </div>
            <button className="btn primary" type="submit" style={{ alignSelf: 'flex-start' }}>Create theatre</button>
          </form>
        </section>
      </main>
    </>
  );
}
