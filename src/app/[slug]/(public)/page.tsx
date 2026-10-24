import Link from 'next/link';
import type { CSSProperties } from 'react';
import { orgOr404 } from '@/lib/tenant';
import { moviesOf, showsBetween, type ShowRow } from '@/lib/queries';
import { addDaysKey, dateKeyIn, dayOfMonth, dayWord, dur, fmtDate, fmtTime, monthShort, weekdayShort, zonedToUtc } from '@/lib/format';
import { Poster } from '@/components/Poster';

export const dynamic = 'force-dynamic';

function avail(s: ShowRow, tz: string) {
  if (s.status === 'cancelled') return { cls: '', label: 'Cancelled', off: true };
  if (s.startsAt.getTime() <= Date.now()) return { cls: '', label: 'Started', off: true };
  if (s.opens !== 'now') {
    const day = addDaysKey(s.date, s.opens === 'd1' ? -1 : -2);
    if (Date.now() < zonedToUtc(day, '00:00', tz).getTime()) return { cls: '', label: `Opens ${fmtDate(day)}`, off: true };
  }
  const free = 1 - s.sold / Math.max(1, s.sellable);
  if (free <= 0) return { cls: '', label: 'Housefull', off: true };
  if (free < .15) return { cls: 'bad', label: 'Almost full', off: false };
  if (free < .4) return { cls: 'warn', label: 'Fast filling', off: false };
  return { cls: 'ok', label: 'Available', off: false };
}

export default async function CustomerHome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ date?: string }> }) {
  const org = await orgOr404((await params).slug);
  const today = dateKeyIn(org.timezone);
  const [allShows, movies] = await Promise.all([showsBetween(org.id, today, addDaysKey(today, 13)), moviesOf(org.id)]);
  const slotOf = (k: string) => org.settings.slots.find(s => s.key === k) ?? { key: k, label: k, time: '00:00' };
  const movie = (id: string) => movies.find(m => m.id === id)!;

  const dates = [...new Set(allShows.map(s => s.date))].sort();
  const bookableOn = (k: string) => allShows.some(s => s.date === k && !avail(s, org.timezone).off);
  const req = (await searchParams).date;
  const date = req && dates.includes(req) ? req : dates.find(bookableOn) ?? dates[0] ?? today;

  const list = allShows.filter(s => s.date === date);
  const groups: { m: (typeof movies)[number]; shows: ShowRow[] }[] = [];
  list.forEach(s => { let g = groups.find(g => g.m.id === s.movieId); if (!g) { g = { m: movie(s.movieId), shows: [] }; groups.push(g); } g.shows.push(s); });

  const open = allShows.filter(s => !avail(s, org.timezone).off);
  const next = open[0];
  const featured = next ? movie(next.movieId) : movies.find(m => m.status === 'now');
  const allDone = list.length > 0 && !list.some(s => !avail(s, org.timezone).off);
  const nextDate = dates.find(k => k > date && bookableOn(k));
  const soon = movies.filter(m => m.status === 'soon');

  return (
    <>
      {featured ? (
        <section className="hero" style={{ '--h': featured.hue } as CSSProperties}>
          <div className="hero-text">
            <p className="eyebrow">Now showing at {org.name}</p>
            <h1>{featured.title}</h1>
            <div className="pills"><span className="pill">{featured.lang}</span><span className="pill">{featured.cert}</span><span className="pill">{dur(featured.mins)}</span>{featured.genre ? <span className="pill">{featured.genre}</span> : null}</div>
            <p className="lede">{featured.line}</p>
            {next ? (
              <div className="hero-cta">
                <Link className="btn primary lg" href={`/${org.slug}/show/${next.id}`}>
                  Book {next.date === today ? (Number(slotOf(next.slot).time.slice(0, 2)) >= 17 ? 'tonight' : 'today') : dayWord(next.date, today)}, {fmtTime(slotOf(next.slot).time)}
                </Link>
                <span className="hint">{next.sellable - next.sold} seats left · {avail(next, org.timezone).label}</span>
              </div>
            ) : null}
          </div>
          <div className="hero-art"><Poster m={featured} sub={`${featured.lang} · ${dur(featured.mins)}`} /></div>
        </section>
      ) : null}

      <div className="sec"><h2>Pick a day</h2></div>
      <div className="dates" role="group" aria-label="Pick a date">
        {dates.map(k => (
          <Link key={k} className="date" href={`/${org.slug}?date=${k}`} aria-pressed={k === date} scroll={false} style={{ textDecoration: 'none' }}>
            <small>{k === today ? 'Today' : weekdayShort(k)}</small><b>{dayOfMonth(k)}</b><small>{monthShort(k)}</small>
          </Link>
        ))}
      </div>
      {allDone ? (
        <div className="banner" style={{ marginTop: 12 }}>
          All shows for {date === today ? 'today' : fmtDate(date)} have started or sold out.{' '}
          {nextDate ? <Link className="btn sm" href={`/${org.slug}?date=${nextDate}`}>See {dayWord(nextDate, today)}</Link> : null}
        </div>
      ) : null}

      <div className="sec"><h2>Now showing</h2><span className="note">{fmtDate(date)}</span></div>
      {groups.length ? (
        <div className="mgrid">
          {groups.map(g => (
            <article key={g.m.id} className="card mcard">
              <Poster m={g.m} />
              <div className="mbody">
                <h3>{g.m.title}</h3>
                <span className="mmeta">{g.m.lang} · {g.m.cert} · {dur(g.m.mins)}{g.m.genre ? ` · ${g.m.genre}` : ''}</span>
                <p className="mline">{g.m.line}</p>
                <div className="times">
                  {g.shows.map(s => {
                    const a = avail(s, org.timezone), pct = Math.round(s.sold / Math.max(1, s.sellable) * 100), t = fmtTime(slotOf(s.slot).time);
                    const inner = <><b>{t}</b><span className="tl">{a.label}</span><i className="fill" style={{ '--p': `${pct}%` } as CSSProperties} /></>;
                    return a.off
                      ? <button key={s.id} className="time" disabled aria-label={`${t}, ${a.label}`}>{inner}</button>
                      : <Link key={s.id} className={`time ${a.cls}`} href={`/${org.slug}/show/${s.id}`} aria-label={`${t}, ${a.label}, ${pct}% full`} style={{ textDecoration: 'none' }}>{inner}</Link>;
                  })}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty"><b>No shows on this day yet</b>Pick another date above.</div>}

      {soon.length ? (
        <>
          <div className="sec"><h2>Coming soon</h2></div>
          <div className="soon">
            {soon.map(m => (
              <article key={m.id} className="card soonc">
                <Poster m={m} sub={m.releaseDate ? `From ${fmtDate(m.releaseDate)}` : 'Coming soon'} />
                <div><h3>{m.title}</h3><span className="mmeta">{m.lang}{m.genre ? ` · ${m.genre}` : ''}</span></div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
