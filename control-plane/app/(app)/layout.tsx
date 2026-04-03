import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/lib/backend';
import { AppProviders } from '../providers';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const session = await requireSession();

  return (
    <AppProviders session={session}>
      <AppShell session={session}>{children}</AppShell>
    </AppProviders>
  );
}
