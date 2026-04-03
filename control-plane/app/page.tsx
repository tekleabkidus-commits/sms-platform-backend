import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/backend';

export default async function HomePage(): Promise<never> {
  const session = await getServerSession();
  redirect(session ? '/dashboard' : '/login');
}
