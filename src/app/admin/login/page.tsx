import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { adminLogin } from '../actions';

export const metadata: Metadata = { title: 'Admin login' };

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <Header title="Platform admin" subtitle="Manage theatres on the platform" logo="TK" href="/" />
      <main className="shell">
        <div className="authwrap">
          <form className="card" action={adminLogin}>
            <h1 className="disp" style={{ fontSize: 34, lineHeight: 1 }}>Log in</h1>
            <label className="f">Email<input className="inp" name="email" type="email" autoComplete="username" required /></label>
            <label className="f">Password<input className="inp" name="password" type="password" autoComplete="current-password" required /></label>
            {error ? <p className="err" role="alert">{error}</p> : null}
            <button className="btn primary lg wide" type="submit">Log in</button>
          </form>
        </div>
      </main>
    </>
  );
}
