import type { CSSProperties } from 'react';

export type PosterMovie = { title: string; cert: string; hue: number };

export function Poster({ m, sub }: { m: PosterMovie; sub?: string }) {
  return (
    <div className="poster" style={{ '--h': m.hue } as CSSProperties}>
      <span className="cert">{m.cert}</span>
      <b>{m.title}</b>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}
