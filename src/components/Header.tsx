import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type NavItem = { href: string; label: string; icon: IconName; current: boolean };

export function Header({ title, subtitle, logo, href, nav, right }: {
  title: string; subtitle?: string; logo: string; href: string; nav?: NavItem[]; right?: ReactNode;
}) {
  return (
    <header className="top">
      <div className="top-in">
        <Link className="brand" href={href} style={{ textDecoration: 'none' }}>
          <span className="logo" aria-hidden="true">{logo}</span>
          <div><b>{title}</b>{subtitle ? <small>{subtitle}</small> : null}</div>
        </Link>
        {nav?.length ? (
          <nav className="modes" aria-label="Switch app">
            {nav.map(n => (
              <Link key={n.href} href={n.href} aria-current={n.current ? 'page' : undefined}><Icon name={n.icon} />{n.label}</Link>
            ))}
          </nav>
        ) : null}
        {right}
      </div>
    </header>
  );
}

export const logoText = (name: string) =>
  name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'T';
