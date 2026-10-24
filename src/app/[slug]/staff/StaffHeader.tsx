import Link from 'next/link';
import { Header, logoText, type NavItem } from '@/components/Header';
import { CAN, type StaffMember } from '@/lib/auth';
import type { Org } from '@/lib/tenant';
import { ROLE_LABEL } from '@/lib/types';
import { staffLogout } from './actions';

export function StaffHeader({ org, me, current }: { org: Org; me: StaffMember | null; current: 'counter' | 'gate' | 'owner' | null }) {
  const nav: NavItem[] = [];
  if (me) {
    if (CAN.counter.includes(me.role)) nav.push({ href: `/${org.slug}/staff/counter`, label: 'Box office', icon: 'counter', current: current === 'counter' });
    if (CAN.gate.includes(me.role)) nav.push({ href: `/${org.slug}/staff/gate`, label: 'Entry gate', icon: 'scan', current: current === 'gate' });
    if (CAN.manage.includes(me.role)) nav.push({ href: `/${org.slug}/staff/owner`, label: me.role === 'owner' ? 'Owner' : 'Manage', icon: 'chart', current: current === 'owner' });
  }
  return (
    <Header title={org.name} subtitle={me ? `${me.name} · ${ROLE_LABEL[me.role]}` : 'Staff'} logo={logoText(org.name)} href={me ? `/${org.slug}/staff` : `/${org.slug}`} nav={nav}
      right={
        <div className="topnav">
          <Link className="btn sm" href={`/${org.slug}`}>Customer site</Link>
          {me ? <form action={staffLogout.bind(null, org.slug)}><button className="btn sm" type="submit">Log out</button></form> : null}
        </div>
      } />
  );
}
