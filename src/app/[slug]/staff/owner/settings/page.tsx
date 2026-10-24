import { CAN, requireStaff } from '@/lib/auth';
import { orgOr404 } from '@/lib/tenant';
import { saveSettings } from '../actions';
import { Flash } from '../Flash';

export const dynamic = 'force-dynamic';

export default async function Settings({ params }: { params: Promise<{ slug: string }> }) {
  const org = await orgOr404((await params).slug);
  await requireStaff(org.id, org.slug, CAN.ownerOnly);
  const s = org.settings;
  return (
    <>
      <div className="ohead"><div><p className="eyebrow">{org.name}</p><h1>Settings</h1></div></div>
      <Flash />
      <form className="card panel" action={saveSettings.bind(null, org.slug)} style={{ maxWidth: 720 }}>
        <div className="dsec" style={{ borderTop: 0, paddingTop: 0 }}><h3>Show times</h3>
          <div className="fgrid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
            {s.slots.map(sl => <label className="f" key={sl.key}>{sl.label}<input className="inp" type="time" name={`slot_${sl.key}`} defaultValue={sl.time} /></label>)}
          </div>
          <p className="note">New times apply to shows you add from now on. Existing shows keep their time.</p></div>
        <div className="dsec"><h3>Default ticket prices</h3>
          <div className="fgrid">{s.classes.map(c => <label className="f" key={c.key}>{c.name} ₹<input className="inp num" type="number" min={0} step={10} name={`price_${c.key}`} defaultValue={c.defaultPricePaise / 100} /></label>)}</div>
          <p className="note">Used when adding a show. You can still change prices per show.</p></div>
        <div className="dsec"><h3>Online booking</h3>
          <div className="fgrid">
            <label className="f">Booking fee per seat ₹<input className="inp num" type="number" min={0} step={1} name="fee" defaultValue={s.bookingFeePaise / 100} /></label>
            <label className="f">Checkout hold, minutes<input className="inp num" type="number" min={3} max={30} name="hold" defaultValue={s.holdMinutes} /></label>
            <label className="f">Seats per booking<input className="inp num" type="number" min={1} max={20} name="max" defaultValue={s.maxSeats} /></label>
          </div>
          <p className="note">GST of {Math.round(s.gstRate * 100)}% is added to the booking fee. The box office never charges a booking fee.</p></div>
        <div className="dsec"><h3>Box office</h3>
          <div className="fgrid"><label className="f">Cart hold, minutes<input className="inp num" type="number" min={1} max={15} name="chold" defaultValue={s.counterHoldMinutes} /></label></div></div>
        <button className="btn primary" type="submit" style={{ alignSelf: 'flex-start' }}>Save settings</button>
      </form>
    </>
  );
}
