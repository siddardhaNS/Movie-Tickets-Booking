'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';

const TABS: [string, IconName, string, boolean][] = [
  ['', 'home', 'Today', false], ['shows', 'cal', 'Shows', false], ['movies', 'film', 'Movies', false], ['layout', 'seat', 'Seat layout', false],
  ['bookings', 'list', 'Bookings', false], ['staff', 'users', 'Staff', true], ['history', 'clock', 'Change history', false],
  ['reports', 'report', 'Reports', true], ['settings', 'counter', 'Settings', true],
];

export function OwnerNav({ base, isOwner, alerts }: { base: string; isOwner: boolean; alerts: number }) {
  const path = usePathname();
  return (
    <nav className="card side" aria-label="Owner sections">
      {TABS.filter(t => isOwner || !t[3]).map(([k, ic, l]) => {
        const href = k ? `${base}/${k}` : base;
        const on = k ? path.startsWith(href) : path === base;
        return (
          <Link key={k} href={href} aria-current={on ? 'page' : undefined}>
            <Icon name={ic} />{l}{!k && alerts ? <span className="badge">{alerts}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
