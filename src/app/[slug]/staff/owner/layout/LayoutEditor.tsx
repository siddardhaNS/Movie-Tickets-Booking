'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Layout, SeatClass } from '@/lib/types';
import { seatsInRow } from '@/lib/layout';
import { saveLayout } from '../actions';

const nextLetter = (L: Layout) => {
  const used = new Set(L.map(r => r.r));
  for (const c of 'ABCDEFGHJKLMNPQRSTUVWXYZ') if (!used.has(c)) return c;
  return 'AA';
};

export function LayoutEditor({ slug, layout, classes }: { slug: string; layout: Layout; classes: SeatClass[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Layout>(() => structuredClone(layout));
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(draft) !== JSON.stringify(layout);
  const tot = (c: string) => draft.filter(r => r.cls === c).reduce((n, r) => n + seatsInRow(r).length, 0);
  const edit = (i: number, f: (r: Layout[number]) => void) => setDraft(d => { const x = structuredClone(d); f(x[i]); return x; });

  return (
    <>
      <div className="ohead"><div><p className="eyebrow">Set up once</p><h1>Seat layout</h1></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dirty ? <button className="btn" onClick={() => { setDraft(structuredClone(layout)); setMsg({}); }}>Discard</button> : null}
          <button className="btn primary" disabled={!dirty || pending} onClick={() => start(async () => {
            const r = await saveLayout(slug, draft);
            if ('error' in r && r.error) setMsg({ error: r.error }); else { setMsg({ ok: 'Seat layout saved.' }); router.refresh(); }
          })}>{pending ? 'Saving…' : 'Save layout'}</button>
        </div></div>
      {msg.error ? <div className="banner" role="alert">{msg.error}</div> : null}
      {msg.ok && !dirty ? <div className="card" role="status" style={{ padding: '12px 16px', color: 'var(--ok)', fontWeight: 700 }}>{msg.ok}</div> : null}
      <div className="pills">
        {classes.map(c => <span className="pill" key={c.key}>{c.name} · {tot(c.key)}</span>)}
        <span className="pill acc">Total · {classes.reduce((n, c) => n + tot(c.key), 0)} seats</span>
        {dirty ? <span className="pill warn">Unsaved changes</span> : null}
      </div>
      <section className="card hcard">
        <div className="hd"><h3>Rows, front to back</h3><span className="note">Tap a seat to mark it as no seat or broken. The gap in the middle is the aisle.</span></div>
        {draft.map((row, i) => {
          const half = Math.ceil(row.n / 2);
          return (
            <div className="lrow" key={row.r}>
              <span className="rl">{row.r}</span>
              <select className="inp" value={row.cls} aria-label={`Class for row ${row.r}`} onChange={e => edit(i, r => { r.cls = e.target.value; })}>
                {classes.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
              <span className="stepper">
                <button onClick={() => edit(i, r => { r.n = Math.max(2, r.n - 1); r.off = r.off.filter(n => n <= r.n); })} aria-label={`Fewer seats in row ${row.r}`}>−</button>
                <b className="num">{row.n}</b>
                <button onClick={() => edit(i, r => { r.n = Math.min(40, r.n + 1); })} aria-label={`More seats in row ${row.r}`}>+</button>
              </span>
              <div className="lseats">
                {Array.from({ length: row.n }, (_, j) => [
                  j === half ? <span className="lgap" key={`g${j}`} /> : null,
                  <button key={j} className={`lseat${row.off.includes(j + 1) ? ' off' : ''}`} aria-pressed={row.off.includes(j + 1)} aria-label={`Seat ${row.r}${j + 1}`}
                    onClick={() => edit(i, r => { r.off = r.off.includes(j + 1) ? r.off.filter(x => x !== j + 1) : [...r.off, j + 1]; })}>{j + 1}</button>,
                ])}
              </div>
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          <button className="btn sm" onClick={() => setDraft(d => [...d, { r: nextLetter(d), cls: d.at(-1)?.cls ?? classes[0].key, n: d.at(-1)?.n ?? 14, off: [] }])}>+ Add row at the back</button>
          {draft.length > 1 ? <button className="btn sm danger" onClick={() => setDraft(d => d.slice(0, -1))}>Remove last row</button> : null}
        </div>
      </section>
      <p className="note">Changes apply to the hall and to every upcoming show. Seats that are already booked or in someone&apos;s cart stay as they are.</p>
    </>
  );
}
