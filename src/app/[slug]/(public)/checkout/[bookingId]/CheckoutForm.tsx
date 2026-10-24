'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { inr2, mmss } from '@/lib/format';
import { rememberTicket } from '../../tickets/store';

const UPI_APPS = [['PhonePe', 'Pe'], ['Google Pay', 'G'], ['Paytm', 'P'], ['BHIM', 'B']];
const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Union Bank of India', 'Canara Bank'];

export function CheckoutForm({ slug, bookingId, total }: { slug: string; bookingId: string; total: number }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pay, setPay] = useState<'upi' | 'card' | 'nb'>('upi');
  const [app, setApp] = useState('PhonePe');
  const [bank, setBank] = useState(BANKS[0]);
  const [err, setErr] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => { try { setName(localStorage.getItem('tb-name') ?? ''); setPhone(localStorage.getItem('tb-phone') ?? ''); } catch { /* storage blocked */ } }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setErr('Enter the name the booking should be under.');
    if (!/^[6-9]\d{9}$/.test(phone)) return setErr('Enter a 10-digit mobile number starting with 6, 7, 8 or 9.');
    setErr(''); setPaying(true);
    try {
      const r = await fetch(`/api/t/${slug}/bookings/${bookingId}/pay`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim(), phone, method: pay }),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error ?? 'Payment failed. Try again.'); setPaying(false); return; }
      try { localStorage.setItem('tb-name', name.trim()); localStorage.setItem('tb-phone', phone); } catch { /* ignore */ }
      rememberTicket(slug, bookingId);
      router.replace(`/${slug}/ticket/${bookingId}`);
    } catch {
      setErr('Network problem. Check your connection; your seats stay held for now.'); setPaying(false);
    }
  }

  return (
    <form className="card panel" onSubmit={submit} noValidate>
      <div className="twocol">
        <label className="f">Name<input className="inp" autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lakshmi P" /></label>
        <label className="f">Mobile number<input className="inp" inputMode="numeric" maxLength={10} autoComplete="tel-national" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="10-digit number" /></label>
      </div>
      <p className="note" style={{ marginTop: -6 }}>Your ticket is linked to this number.</p>
      <div className="seg" role="group" aria-label="Payment method">
        {([['upi', 'UPI'], ['card', 'Card'], ['nb', 'Net banking']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={pay === k} onClick={() => setPay(k)}>{l}</button>
        ))}
      </div>
      {pay === 'upi' ? (
        <>
          <div className="apps" role="group" aria-label="UPI app">
            {UPI_APPS.map(([n, i]) => <button key={n} type="button" className="appb" aria-pressed={app === n} onClick={() => setApp(n)}><i>{i}</i>{n}</button>)}
          </div>
          <p className="note">You will get a request in {app} to approve the payment.</p>
        </>
      ) : pay === 'card' ? (
        <p className="note">You&apos;ll enter your card details on the payment provider&apos;s secure page next. Visa, Mastercard and RuPay work.</p>
      ) : (
        <label className="f">Your bank<select className="inp" value={bank} onChange={e => setBank(e.target.value)}>{BANKS.map(b => <option key={b}>{b}</option>)}</select></label>
      )}
      {err ? <p className="err" role="alert">{err}</p> : null}
      <button className="btn primary lg wide" type="submit" disabled={paying}>Pay {inr2(total)}</button>
      <p className="note">Test payment gateway. Nothing is charged.</p>
      {paying ? (
        <div className="overlay"><div className="card modal center" role="dialog" aria-label="Payment in progress">
          <div className="spinner" aria-hidden="true" />
          <h3>{pay === 'upi' ? `Approve ${inr2(total)} in ${app}` : 'Confirming your payment'}</h3>
          <p className="note">Don&apos;t close this page. Your seats stay held.</p>
        </div></div>
      ) : null}
    </form>
  );
}

export function HoldTimer({ until, slug, showId }: { until: string; slug: string; showId: string }) {
  const end = new Date(until).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (now >= end) {
    return <div className="banner" role="alert">Your hold ran out, so the seats went back on sale. <Link className="btn sm" href={`/${slug}/show/${showId}`}>Pick again</Link></div>;
  }
  return <div className="timer" role="timer"><span>Your seats are held for you</span><b>{mmss(end - now)}</b></div>;
}

export function BackButton({ slug, bookingId, showId }: { slug: string; bookingId: string; showId: string }) {
  const router = useRouter();
  return (
    <button className="btn sm" onClick={async () => {
      await fetch(`/api/t/${slug}/holds/${bookingId}`, { method: 'DELETE' }).catch(() => null);
      router.push(`/${slug}/show/${showId}`);
    }}>← Change seats</button>
  );
}
