'use client';

import { useSearchParams } from 'next/navigation';

/** Shows the ?ok= / ?error= message left by a server action redirect. */
export function Flash() {
  const q = useSearchParams();
  const ok = q.get('ok'), error = q.get('error');
  if (error) return <div className="banner" role="alert">{error}</div>;
  if (ok) return <div className="card" role="status" style={{ padding: '12px 16px', color: 'var(--ok)', fontWeight: 700 }}>{ok}</div>;
  return null;
}
