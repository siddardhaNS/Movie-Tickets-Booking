import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="shell">
      <div className="empty" style={{ marginTop: 40 }}>
        <b>Page not found</b>
        The theatre or show you were looking for isn't here.
        <Link className="btn primary" href="/">All theatres</Link>
      </div>
    </main>
  );
}
