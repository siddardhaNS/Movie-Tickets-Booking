import type { Metadata } from 'next';
import { orgOr404 } from '@/lib/tenant';
import { dateKeyIn } from '@/lib/format';
import { MyTickets } from './MyTickets';

export const metadata: Metadata = { title: 'My tickets' };

export default async function TicketsPage({ params }: { params: Promise<{ slug: string }> }) {
  const org = await orgOr404((await params).slug);
  return <MyTickets slug={org.slug} today={dateKeyIn(org.timezone)} slots={org.settings.slots} />;
}
