import Link from 'next/link';
import { CAN, requireStaff } from '@/lib/auth';
import { orgOr404 } from '@/lib/tenant';
import { staffOf } from '@/lib/queries';
import { initials, mask } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/types';
import { addStaff, resetPin, toggleStaff } from '../actions';
import { Drawer } from '../Drawer';
import { Flash } from '../Flash';

export const dynamic = 'force-dynamic';

export default async function Staff({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ add?: string }> }) {
  const org = await orgOr404((await params).slug);
  await requireStaff(org.id, org.slug, CAN.ownerOnly);
  const list = await staffOf(org.id), base = `/${org.slug}/staff/owner/staff`;
  const { add } = await searchParams;
  return (
    <>
      <div className="ohead"><div><p className="eyebrow">{list.filter(s => s.active).length} active</p><h1>Staff</h1></div>
        <Link className="btn primary" href={`${base}?add=1`} scroll={false}>Add staff</Link></div>
      {!add ? <Flash /> : null}
      <section className="card hcard"><div className="tablewrap"><table className="t">
        <thead><tr><th>Name</th><th>Role</th><th>Mobile</th><th>Login</th><th className="r"><span className="sr">Actions</span></th></tr></thead>
        <tbody>
          {list.map(s => (
            <tr key={s.id}>
              <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(s.name)}</span><b>{s.name}</b></div></td>
              <td><span className={`pill ${s.role === 'owner' ? 'acc' : ''}`}>{ROLE_LABEL[s.role]}</span></td>
              <td className="mono">{mask(s.phone)}</td>
              <td>{s.active ? <span className="pill ok">Active</span> : <span className="pill">Disabled</span>}<span className="sub">Mobile + PIN</span></td>
              <td><div className="acts">
                <form action={resetPin.bind(null, org.slug, s.id)}><button className="btn sm" type="submit">Reset PIN</button></form>
                {s.role !== 'owner' ? <form action={toggleStaff.bind(null, org.slug, s.id)}><button className={`btn sm ${s.active ? 'danger' : ''}`} type="submit">{s.active ? 'Disable' : 'Enable'}</button></form> : null}
              </div></td>
            </tr>
          ))}
        </tbody>
      </table></div></section>
      <section className="card hcard"><h3>What each role can do</h3><div className="tablewrap"><table className="t"><tbody>
        <tr><td><b>Owner</b></td><td>Everything, plus reports, refunds, settings and staff logins</td></tr>
        <tr><td><b>Manager</b></td><td>Movies, show timings, prices, blocked seats, seat layout, cancelling a show; can also sell and scan</td></tr>
        <tr><td><b>Box office</b></td><td>Sell and print tickets at the counter</td></tr>
        <tr><td><b>Gate</b></td><td>Scan tickets at the entry gate</td></tr>
      </tbody></table></div></section>
      {add ? (
        <Drawer title="Add staff" sub="They log in with their mobile number and a PIN. You'll see the PIN once, to give to them." closeHref={base}>
          <form className="stack" action={addStaff.bind(null, org.slug)}>
            <label className="f">Name<input className="inp" name="name" placeholder="Full name" required /></label>
            <label className="f">Mobile number<input className="inp" name="phone" inputMode="numeric" maxLength={10} placeholder="10-digit number" required /></label>
            <label className="f">Role<select className="inp" name="role"><option value="boxoffice">Box office</option><option value="gate">Gate</option><option value="manager">Manager</option></select></label>
            <Flash />
            <button className="btn primary wide" type="submit">Add and create PIN</button>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
