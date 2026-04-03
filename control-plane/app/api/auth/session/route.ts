import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/backend';

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(session);
}
