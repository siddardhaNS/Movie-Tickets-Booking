import { CAN, requireStaff } from '@/lib/auth';
import { orgOr404 } from '@/lib/tenant';
import { paymentsNeedingRefund } from '@/lib/queries';
import { StaffHeader } from '../StaffHeader';
import { OwnerNav } from './OwnerNav';

export default async function OwnerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const org = await orgOr404((await params).slug);
  const me = await requireStaff(org.id, org.slug, CAN.manage);
  const alerts = (await paymentsNeedingRefund(org.id)).length;
  return (
    <>
      <StaffHeader org={org} me={me} current="owner" />
      <main className="shell">
        <div className="owner">
          <OwnerNav base={`/${org.slug}/staff/owner`} isOwner={me.role === 'owner'} alerts={alerts} />
          <section className="ocontent">{children}</section>
        </div>
      </main>
    </>
  );
}
