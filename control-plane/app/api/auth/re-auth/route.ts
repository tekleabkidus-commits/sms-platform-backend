import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, SESSION_COOKIE_NAME } from '@/lib/backend';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const response = await backendFetch<{ reauthToken: string; expiresInSeconds: number }>(
    '/auth/re-auth',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token,
  );

  return NextResponse.json(response);
}
