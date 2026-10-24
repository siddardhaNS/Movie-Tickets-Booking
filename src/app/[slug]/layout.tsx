import { orgOr404 } from '@/lib/tenant';
import { StyleSetter } from '@/components/StyleSetter';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const org = await orgOr404((await params).slug);
  return { title: { default: org.name, template: `%s · ${org.name}` } };
}

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const org = await orgOr404((await params).slug);
  return <><StyleSetter style={org.settings.style} />{children}</>;
}
