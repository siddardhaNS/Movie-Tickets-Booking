import { CAN, requireStaff } from '@/lib/auth';
import { orgOr404 } from '@/lib/tenant';
import { auditOf } from '@/lib/queries';
import { dateKeyIn, when } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function History({ params }: { params: Promise<{ slug: string }> }) {
  const org = await orgOr404((await params).slug);
  await requireStaff(org.id, org.slug, CAN.manage);
  const list = await auditOf(org.id), today = dateKeyIn(org.timezone);
  return (
    <>
      <div className="ohead"><div><p className="eyebrow">{list.length} changes</p><h1>Change history</h1></div><span className="note">Who changed prices, seats, shows or money, and when.</span></div>
      <section className="card hcard">
        {list.length ? list.map(a => (
          <div className="hrow" key={a.id}><time>{when(a.at, org.timezone, today)}</time><div><b>{a.action}</b><span>{a.actor}{a.detail ? ` · ${a.detail}` : ''}</span></div></div>
        )) : <div className="empty" style={{ margin: 16 }}><b>No changes yet</b></div>}
      </section>
    </>
  );
}
