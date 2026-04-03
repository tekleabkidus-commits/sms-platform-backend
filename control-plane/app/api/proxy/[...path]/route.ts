import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getBackendBaseUrl, SESSION_COOKIE_NAME } from '@/lib/backend';

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { path } = await context.params;
  const upstreamUrl = new URL(`${getBackendBaseUrl()}/${path.join('/')}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  const response = await fetch(upstreamUrl, {
    method: request.method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': request.headers.get('content-type') ?? 'application/json',
      ...(request.headers.get('x-request-id') ? { 'x-request-id': request.headers.get('x-request-id') ?? '' } : {}),
      ...(request.headers.get('x-reauth-token') ? { 'x-reauth-token': request.headers.get('x-reauth-token') ?? '' } : {}),
    },
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    cache: 'no-store',
  });

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
      ...(response.headers.get('x-request-id') ? { 'x-request-id': response.headers.get('x-request-id') ?? '' } : {}),
    },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  return proxy(request, context);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  return proxy(request, context);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  return proxy(request, context);
}
