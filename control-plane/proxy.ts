import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/backend';
import { getBackendBaseUrl } from '@/lib/runtime-env';

const PUBLIC_PATHS = ['/login', '/unauthorized'];
const AUTH_CHECK_PATH = '/auth/me';

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

async function validateSession(token: string): Promise<boolean | null> {
  const backendBaseUrl = getBackendBaseUrl();

  try {
    const response = await fetch(`${backendBaseUrl}${AUTH_CHECK_PATH}`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next')
    || pathname.startsWith('/api/auth')
    || pathname.startsWith('/api/proxy')
    || pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const publicPath = isPublicPath(pathname);

  if (!token && !publicPath) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!token) {
    return NextResponse.next();
  }

  const sessionValid = await validateSession(token);

  if (sessionValid === false) {
    if (publicPath) {
      const response = NextResponse.next();
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('reason', 'session-expired');
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  if (sessionValid === true && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!.*\\..*).*)'],
};
