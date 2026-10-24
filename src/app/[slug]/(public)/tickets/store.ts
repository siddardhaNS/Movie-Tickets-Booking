// The customer's own bookings are remembered in this browser (no customer accounts yet).
const key = (slug: string) => `tb-tickets-${slug}`;

export function rememberTicket(slug: string, bookingId: string) {
  try {
    const list = readTickets(slug).filter(x => x !== bookingId);
    localStorage.setItem(key(slug), JSON.stringify([bookingId, ...list].slice(0, 50)));
  } catch { /* storage blocked */ }
}

export function readTickets(slug: string): string[] {
  try { const v = JSON.parse(localStorage.getItem(key(slug)) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; }
  catch { return []; }
}
