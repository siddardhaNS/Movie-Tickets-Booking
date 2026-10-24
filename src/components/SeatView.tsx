'use client';

import { useEffect, useRef } from 'react';
import type { Layout } from '@/lib/types';
import { seatGeo } from '@/lib/seatgeo';


// "View from your seat": a canvas sketch of the screen as seen from a seat. Ported from the mockup.

type Geo = { ri: number; f: number; bal: number; bal0: number };
type Movie = { title: string; cert: string; lang: string; hue: number };

const hash = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed: number) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

function posterArt(m: Movie) {
  const fam = getComputedStyle(document.documentElement).getPropertyValue('--f-display').trim() || 'Impact, sans-serif';
  const c = document.createElement('canvas'); c.width = 800; c.height = 336;
  const x = c.getContext('2d')!, hue = m.hue, W = c.width, H = c.height;
  const g = x.createLinearGradient(0, 0, W * .35, H); g.addColorStop(0, `hsl(${hue},72%,52%)`); g.addColorStop(1, `hsl(${hue + 40},60%,18%)`);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.save(); x.translate(W / 2, H / 2); x.rotate(-25 * Math.PI / 180); x.fillStyle = 'rgba(255,255,255,.07)';
  for (let i = -W; i < W; i += 22) x.fillRect(i, -W, 6, W * 2);
  x.restore();
  x.fillStyle = 'hsla(45,100%,82%,.9)'; x.beginPath(); x.arc(W * .82, H * .26, H * .12, 0, Math.PI * 2); x.fill();
  const vg = x.createLinearGradient(0, H * .45, 0, H); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
  const title = m.title.toUpperCase();
  let size = 120; x.font = `800 ${size}px ${fam}`;
  while (x.measureText(title).width > W * .84 && size > 30) { size -= 4; x.font = `800 ${size}px ${fam}`; }
  x.fillStyle = '#FFFFFF'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 18;
  x.fillText(title, W / 2, H * .47);
  x.shadowBlur = 0; x.font = `600 26px ${getComputedStyle(document.body).fontFamily}`; x.fillStyle = 'rgba(255,255,255,.85)';
  x.fillText(`${m.lang} · ${m.cert}  ·  NOW SHOWING`, W / 2, H * .47 + size * .62 + 18);
  return c;
}

function draw(cv: HTMLCanvasElement, p: Geo, art: HTMLCanvasElement, m: Movie, seed: string) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(320, Math.round((cv.clientWidth || 640) * dpr)), H = Math.round(W / 2);
  if (cv.width !== W) { cv.width = W; cv.height = H; }
  const x = cv.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#06071a'); g.addColorStop(1, '#15183a'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const d = 1 + p.ri * .3, sw = W * 1.35 / d, sh = sw * .42, k = .55 / d;
  const cx = W / 2 - p.f * W * .32 / Math.sqrt(d), cy = H * .37 + p.bal * H * .1 - Math.max(0, 2 - p.ri) * H * .04;
  const hl = sh * (1 - p.f * k), hr = sh * (1 + p.f * k), L = cx - sw / 2, R = cx + sw / 2;
  x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = Math.max(1, W / 500);
  ([[0, 0, L, cy - hl / 2], [W, 0, R, cy - hr / 2], [0, H, L, cy + hl / 2], [W, H, R, cy + hr / 2]] as const).forEach(([a, b, c2, d2]) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d2); x.stroke(); });
  const rg = x.createRadialGradient(cx, cy, sw * .05, cx, cy, sw * .9); rg.addColorStop(0, `hsla(${m.hue},80%,60%,.32)`); rg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rg; x.fillRect(0, 0, W, H);
  x.save(); x.beginPath(); x.moveTo(L, cy - hl / 2); x.lineTo(R, cy - hr / 2); x.lineTo(R, cy + hr / 2); x.lineTo(L, cy + hl / 2); x.closePath(); x.clip();
  const N = 64;
  for (let i = 0; i < N; i++) { const t = i / N, h = hl + (hr - hl) * (t + .5 / N); x.drawImage(art, art.width * t, 0, art.width / N, art.height, L + sw * t, cy - h / 2, sw / N + 1, h); }
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.moveTo(L, cy - hl / 2); x.lineTo(R, cy - hr / 2); x.lineTo(R, cy + hr / 2); x.lineTo(L, cy + hl / 2); x.closePath(); x.stroke();
  const ahead = Math.round(p.bal > .5 ? Math.max(0, p.ri - p.bal0) : p.ri);
  const r = rng(hash(seed));
  for (let j = Math.min(ahead, 7); j >= 1; j--) {
    const t = 1 - 1 / (1 + .45 * j), y = H * (1.02 - .44 * t), s = 1 / (.5 + .5 * j), hr2 = W * .034 * s, step = hr2 * 2.7;
    x.fillStyle = '#1b1e42'; x.fillRect(0, y, W, H - y);
    x.fillStyle = '#020309';
    const off = ((p.f * W * .2 * s) % step + step) % step;
    for (let px = -step + off; px < W + step; px += step) {
      if (r() < .72) { x.beginPath(); x.arc(px, y - hr2 * .25, hr2, 0, Math.PI * 2); x.fill(); x.beginPath(); x.ellipse(px, y + hr2 * .9, hr2 * 1.5, hr2 * .9, 0, 0, Math.PI * 2); x.fill(); }
    }
  }
  if (p.bal > .5) { x.fillStyle = 'rgba(28,31,70,.96)'; x.fillRect(0, H * .88, W, H * .12); x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(0, H * .88, W, Math.max(1, W / 400)); }
  const vg = x.createRadialGradient(W / 2, H / 2, H * .4, W / 2, H / 2, W * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
}

export function SeatView({ layout, seatId, movie, seed, label }: { layout: Layout; seatId: string; movie: Movie; seed: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cur = useRef<Geo | null>(null);
  const art = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    if (!art.current) art.current = posterArt(movie);
    const g = seatGeo(layout, seatId), target: Geo = { ri: g.ri, f: g.f, bal: g.bal ? 1 : 0, bal0: g.bal0 };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!cur.current || reduced) { cur.current = { ...target }; draw(cv, cur.current, art.current, movie, seed); return; }
    cur.current.bal0 = target.bal0;
    let raf = 0;
    const step = () => {
      let moving = false;
      for (const k of ['ri', 'f', 'bal'] as const) {
        const d = target[k] - cur.current![k];
        if (Math.abs(d) > .003) { cur.current![k] += d * .2; moving = true; } else cur.current![k] = target[k];
      }
      draw(cv, cur.current!, art.current!, movie, seed);
      if (moving) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [layout, seatId, movie, seed]);

  useEffect(() => {
    const onResize = () => { if (ref.current && cur.current && art.current) draw(ref.current, cur.current, art.current, movie, seed); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [movie, seed]);

  return <canvas ref={ref} className="seatview" role="img" aria-label={label} />;
}
