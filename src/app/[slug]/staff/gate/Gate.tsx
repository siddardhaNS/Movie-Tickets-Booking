'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

type Show = { id: string; label: string; slot: string; gates: string; sold: number; inside: number };
type Result = { ok: boolean; title?: string; msg?: string; code: string; seats: string[] };
type Detector = { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> };

export function Gate({ slug, shows, current }: { slug: string; shows: Show[]; current: Show }) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [recent, setRecent] = useState<(Result & { at: number })[]>([]);
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastCode = useRef({ code: '', at: 0 });
  const busy = useRef(false);
  const pct = current.sold ? Math.round(current.inside / current.sold * 100) : 0;

  const check = useCallback(async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code || busy.current) return;
    // Ignore the same QR held in front of the camera for a couple of seconds.
    if (code === lastCode.current.code && Date.now() - lastCode.current.at < 2500) return;
    lastCode.current = { code, at: Date.now() };
    busy.current = true;
    try {
      const r = await fetch(`/api/t/${slug}/gate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ showId: current.id, code }) });
      const d = await r.json();
      const res: Result = r.ok ? d : { ok: false, title: 'Could not check', msg: d.error ?? 'Try again.', code, seats: [] };
      setResult(res); setRecent(x => [{ ...res, at: Date.now() }, ...x].slice(0, 8));
      try { navigator.vibrate?.(res.ok ? 80 : [60, 60, 60]); } catch { /* not supported */ }
      if (res.ok) router.refresh();
    } catch {
      setResult({ ok: false, title: 'No internet', msg: 'Could not reach the server. Check the connection and scan again.', code, seats: [] });
    } finally { busy.current = false; }
  }, [slug, current.id, router]);

  // Camera scanning with the browser's built-in QR detector (Chrome / Android). Typing the code always works.
  useEffect(() => {
    if (!camOn) return;
    let stream: MediaStream | null = null, stop = false, timer = 0;
    (async () => {
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (!BD) { setCamErr("This browser can't read QR codes. Type the booking ID instead, or use Chrome on Android."); setCamOn(false); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = videoRef.current!; v.srcObject = stream; await v.play();
        const det = new BD({ formats: ['qr_code'] });
        const loop = async () => {
          if (stop) return;
          try { const codes = await det.detect(v); if (codes[0]) await check(codes[0].rawValue); } catch { /* frame not ready */ }
          timer = window.setTimeout(loop, 250);
        };
        loop();
      } catch { setCamErr('Camera permission was refused. Allow the camera, or type the booking ID.'); setCamOn(false); }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [camOn, check]);

  return (
    <div className="gate">
      <div className="g-top">
        <label className="sr" htmlFor="gshow">Show</label>
        <select className="inp" id="gshow" value={current.id} onChange={e => { setResult(null); router.push(`/${slug}/staff/gate?show=${e.target.value}`); }}>
          {shows.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <section className="card g-stats">
        <div className="ring" style={{ '--p': pct } as CSSProperties}><b>{pct}%</b></div>
        <div className="t"><b className="num">{current.inside} of {current.sold} in</b><span>{current.slot} · gates open {current.gates}</span></div>
      </section>
      <div className="cam">
        {camOn ? <video ref={videoRef} className="camfeed" muted playsInline /> : null}
        <div className="fr" aria-hidden="true"><i /><i /><i /><i /></div>
        {camOn ? <div className="beam" aria-hidden="true" /> : null}
        <span className="cap">{camOn ? 'Point the camera at the ticket QR' : 'Camera is off'}</span>
      </div>
      {camErr ? <div className="offline" role="status">{camErr}</div> : null}
      <div className="g-actions">
        <button className="btn primary lg" onClick={() => { setCamErr(''); setCamOn(!camOn); }}>{camOn ? 'Stop camera' : 'Start scanning'}</button>
        <button className="btn lg" onClick={() => setResult(null)}>Clear result</button>
      </div>
      <form className="keyform" style={{ flex: 'auto' }} onSubmit={e => { e.preventDefault(); const i = (e.currentTarget.elements.namedItem('gcode') as HTMLInputElement); lastCode.current.code = ''; check(i.value); i.value = ''; }}>
        <label className="sr" htmlFor="gcode">Booking ID</label>
        <input className="inp" id="gcode" name="gcode" autoComplete="off" placeholder="Or type a booking ID, like HS7K2Q9" />
        <button className="btn" type="submit">Check</button>
      </form>
      {result ? (result.ok
        ? <div className="gres good" role="status"><span className="ic">✓</span><div><h3>Let in · {result.seats.length} {result.seats.length > 1 ? 'people' : 'person'}</h3><p className="mono">{result.seats.join(' ')}</p></div></div>
        : <div className="gres no" role="alert"><span className="ic">✕</span><div><h3>{result.title}</h3><p>{result.msg}</p></div></div>) : null}
      {recent.length ? (
        <section className="card scans"><h3>Recent scans</h3>
          {recent.map((x, i) => (
            <div className="scan" key={i}><span><b>{x.code}</b> · {x.seats.join(' ') || '—'}</span>
              <span className={x.ok ? '' : 'err'}>{x.ok ? 'In' : 'Refused'} · {new Date(x.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span></div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
