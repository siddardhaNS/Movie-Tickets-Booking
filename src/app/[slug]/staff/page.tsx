import { redirect } from 'next/navigation';
import { CAN, currentStaff } from '@/lib/auth';
import { orgOr404 } from '@/lib/tenant';

// Send each person to the screen their role uses.
export default async function StaffHome({ params }: { params: Promise<{ slug: string }> }) {
  const org = await orgOr404((await params).slug);
  const me = await currentStaff(org.id);
  if (!me) redirect(`/${org.slug}/staff/login`);
  if (CAN.manage.includes(me.role)) redirect(`/${org.slug}/staff/owner`);
  if (CAN.counter.includes(me.role)) redirect(`/${org.slug}/staff/counter`);
  redirect(`/${org.slug}/staff/gate`);
}
