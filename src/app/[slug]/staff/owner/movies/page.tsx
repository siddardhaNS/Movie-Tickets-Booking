import Link from 'next/link';
import { CAN, requireStaff } from '@/lib/auth';
import { orgOr404 } from '@/lib/tenant';
import { moviesOf, showsBetween } from '@/lib/queries';
import { addDaysKey, dateKeyIn, dur, fmtDate } from '@/lib/format';
import { Poster } from '@/components/Poster';
import { saveMovie } from '../actions';
import { Drawer } from '../Drawer';
import { Flash } from '../Flash';

export const dynamic = 'force-dynamic';

export default async function Movies({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ edit?: string }> }) {
  const org = await orgOr404((await params).slug);
  await requireStaff(org.id, org.slug, CAN.manage);
  const base = `/${org.slug}/staff/owner/movies`, today = dateKeyIn(org.timezone);
  const [movies, upcoming] = await Promise.all([moviesOf(org.id), showsBetween(org.id, today, addDaysKey(today, 30))]);
  const { edit } = await searchParams;
  const m = edit === 'new' ? null : movies.find(x => x.id === edit);
  const blank = { title: '', lang: 'Telugu', cert: 'UA', mins: 140, genre: '', status: 'now', releaseDate: '', line: '' };
  const v = m ?? blank;

  return (
    <>
      <div className="ohead"><div><p className="eyebrow">{movies.length} movies</p><h1>Movies</h1></div>
        <Link className="btn primary" href={`${base}?edit=new`} scroll={false}>Add movie</Link></div>
      {!edit ? <Flash /> : null}
      <div className="mvgrid">
        {movies.map(x => {
          const up = upcoming.filter(s => s.movieId === x.id && s.status === 'open' && s.startsAt.getTime() > Date.now()).length;
          return (
            <Link key={x.id} className="mv" href={`${base}?edit=${x.id}`} scroll={false} style={{ textDecoration: 'none' }}>
              <Poster m={x} /><div><h3>{x.title}</h3><span>{x.lang} · {x.cert} · {dur(x.mins)}</span></div>
              <div className="pills">{x.status === 'now' ? <span className="pill ok">Now showing</span> : <span className="pill acc">From {x.releaseDate ? fmtDate(x.releaseDate) : 'soon'}</span>}
                {up ? <span className="pill">{up} shows ahead</span> : null}</div>
            </Link>
          );
        })}
        <Link className="mv add" href={`${base}?edit=new`} scroll={false} style={{ textDecoration: 'none' }}>+ Add a movie</Link>
      </div>
      {edit && (m || edit === 'new') ? (
        <Drawer title={m ? 'Edit movie' : 'Add a movie'} sub={m ? m.title : 'It appears for customers once you schedule a show.'} closeHref={base}>
          <form className="stack" action={saveMovie.bind(null, org.slug)}>
            {m ? <input type="hidden" name="id" value={m.id} /> : null}
            <label className="f">Title<input className="inp" name="title" defaultValue={v.title} placeholder="Movie title" required /></label>
            <div className="fgrid">
              <label className="f">Language<select className="inp" name="lang" defaultValue={v.lang}>{['Telugu', 'Tamil', 'Hindi', 'English', 'Kannada', 'Malayalam'].map(l => <option key={l}>{l}</option>)}</select></label>
              <label className="f">Certificate<select className="inp" name="cert" defaultValue={v.cert}>{['U', 'UA', 'A'].map(l => <option key={l}>{l}</option>)}</select></label>
              <label className="f">Minutes<input className="inp num" type="number" name="mins" min={30} max={300} defaultValue={v.mins} /></label>
            </div>
            <label className="f">Genre<input className="inp" name="genre" defaultValue={v.genre} placeholder="e.g. Family drama" /></label>
            <label className="f">One-line story<input className="inp" name="line" defaultValue={v.line} placeholder="Shown on the booking page" /></label>
            <div className="twocol">
              <label className="f">Status<select className="inp" name="status" defaultValue={v.status}><option value="now">Now showing</option><option value="soon">Coming soon</option></select></label>
              <label className="f">Release date<input className="inp" type="date" name="releaseDate" defaultValue={v.releaseDate ?? ''} /></label>
            </div>
            <Flash />
            <button className="btn primary wide" type="submit">{m ? 'Save movie' : 'Add movie'}</button>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
