import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { orgOr404 } from '@/lib/tenant';
import { currentStaff } from '@/lib/auth';
import { StaffHeader } from '../StaffHeader';
import { staffLogin } from '../actions';

export const metadata: Metadata = { title: 'Staff login' };

export default async function StaffLogin({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; phone?: string }> }) {
  const org = await orgOr404((await params).slug);
  if (await currentStaff(org.id)) redirect(`/${org.slug}/staff`);
  const { error, phone } = await searchParams;
  return (
    <>
      <StaffHeader org={org} me={null} current={null} />
      <main className="shell">
        <div className="authwrap">
          <form className="card" action={staffLogin.bind(null, org.slug)}>
            <p className="eyebrow">{org.name}</p>
            <h1 className="disp" style={{ fontSize: 34, lineHeight: 1 }}>Staff login</h1>
            <label className="f">Mobile number<input className="inp" name="phone" inputMode="numeric" maxLength={10} autoComplete="username" defaultValue={phone ?? ''} required /></label>
            <label className="f">PIN<input className="inp mono" name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="current-password" required /></label>
            {error ? <p className="err" role="alert">{error}</p> : null}
            <button className="btn primary lg wide" type="submit">Log in</button>
            <p className="note">Owners, managers, box office and gate staff all log in here. The owner sets up logins under Staff.</p>
          </form>
        </div>
      </main>
    </>
  );
}
