import Link from 'next/link';

export function Drawer({ title, sub, closeHref, children }: { title: string; sub?: string; closeHref: string; children: React.ReactNode }) {
  return (
    <>
      <Link className="drawer-bg" href={closeHref} scroll={false} aria-label="Close" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dhead"><div><h2>{title}</h2>{sub ? <p>{sub}</p> : null}</div>
          <Link className="xbtn" href={closeHref} scroll={false} aria-label="Close" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>×</Link></div>
        {children}
      </aside>
    </>
  );
}
