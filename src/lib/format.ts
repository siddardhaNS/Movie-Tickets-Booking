// Date, time and money helpers shared by server and client code.
// Show dates are 'YYYY-MM-DD' strings in the theatre's own timezone; instants are Date / ISO strings.

export const pad = (n: number) => String(n).padStart(2, '0');

export function dateKeyIn(tz: string, at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const v = (t: string) => Number(parts.find(p => p.type === t)!.value);
  return Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second')) - utcMs;
}

/** The instant at which the wall clock in `tz` reads `dateKey` `hhmm`. */
export function zonedToUtc(dateKey: string, hhmm: string, tz: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = tzOffsetMs(guess, tz);
  let res = guess - off;
  const off2 = tzOffsetMs(res, tz);
  if (off2 !== off) res = guess - off2;
  return new Date(res);
}

export function fmtTime(hhmm: string): string {
  let [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
}

const keyDate = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };

export const fmtDate = (key: string) =>
  keyDate(key).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const weekdayShort = (key: string) => keyDate(key).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
export const weekdayLong = (key: string) => keyDate(key).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
export const monthShort = (key: string) => keyDate(key).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
export const dayOfMonth = (key: string) => Number(key.slice(8, 10));

export function dayWord(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today';
  if (key === addDaysKey(todayKey, 1)) return 'Tomorrow';
  if (key === addDaysKey(todayKey, -1)) return 'Yesterday';
  return fmtDate(key);
}

/** Wall-clock time of an instant in `tz`, e.g. "6:15 PM". */
export function clock(at: Date | string | number, tz: string): string {
  return new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).toUpperCase();
}

export function when(at: Date | string | number, tz: string, todayKey: string): string {
  return `${dayWord(dateKeyIn(tz, new Date(at)), todayKey)}, ${clock(at, tz)}`;
}

export const inr = (paise: number) => '₹' + Math.round(paise / 100).toLocaleString('en-IN');
export const inr2 = (paise: number) =>
  '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dur = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;
export const mask = (p: string) => (p ? `${p.slice(0, 2)}••••••${p.slice(-2)}` : '—');
export const initials = (n: string) => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
export const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

export const PAY_LABEL: Record<string, string> = { upi: 'UPI', card: 'Card', nb: 'Net banking', cash: 'Cash' };
