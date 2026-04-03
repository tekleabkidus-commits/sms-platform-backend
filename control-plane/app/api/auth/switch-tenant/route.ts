import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, SESSION_COOKIE_NAME } from '@/lib/backend';
import { SessionData } from '@/lib/api-types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const switched = await backendFetch<{
    accessToken: string;
    expiresIn: string;
  }>('/auth/switch-tenant', {
    method: 'POST',
    body: JSON.stringify(body),
  }, token);

  cookieStore.set(SESSION_COOKIE_NAME, switched.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });

  const session = await backendFetch<SessionData>('/auth/me', {}, switched.accessToken);
  return NextResponse.json(session);
}
