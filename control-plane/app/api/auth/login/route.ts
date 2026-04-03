import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, SESSION_COOKIE_NAME } from '@/lib/backend';
import { SessionData } from '@/lib/api-types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const login = await backendFetch<{
    accessToken: string;
    expiresIn: string;
    user: SessionData['user'];
    tenant: SessionData['tenant'];
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, login.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });

  const session = await backendFetch<SessionData>('/auth/me', {}, login.accessToken);
  return NextResponse.json(session);
}
