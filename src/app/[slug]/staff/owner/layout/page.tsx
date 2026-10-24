import { CAN, requireStaff } from '@/lib/auth';
import { getMainScreen, orgOr404 } from '@/lib/tenant';
import { LayoutEditor } from './LayoutEditor';

export const dynamic = 'force-dynamic';

export default async function LayoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const org = await orgOr404((await params).slug);
  await requireStaff(org.id, org.slug, CAN.manage);
  const screen = await getMainScreen(org.id);
  return <LayoutEditor slug={org.slug} layout={screen.layout} classes={org.settings.classes} />;
}
