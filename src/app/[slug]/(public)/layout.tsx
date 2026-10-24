import Link from 'next/link';
import { orgOr404 } from '@/lib/tenant';
import { Header, logoText } from '@/components/Header';

export default async function PublicLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const org = await orgOr404((await params).slug);
  return (
    <>
      <Header title={org.name} subtitle={org.address || org.city} logo={logoText(org.name)} href={`/${org.slug}`}
        right={<div className="topnav"><Link className="btn sm" href={`/${org.slug}/tickets`}>My tickets</Link></div>} />
      <main className="shell">{children}</main>
    </>
  );
}
