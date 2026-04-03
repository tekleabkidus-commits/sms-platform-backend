import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Role, SessionData } from './api-types';
import { getBackendBaseUrl } from './runtime-env';

export const SESSION_COOKIE_NAME = 'sms_cp_token';

export async function backendFetch<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Backend request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getServerSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  try {
    return await backendFetch<SessionData>('/auth/me', {}, token);
  } catch {
    return null;
  }
}

export async function requireSession(roles?: Role[]): Promise<SessionData> {
  const session = await getServerSession();
  if (!session) {
    redirect('/login');
  }
  if (roles && !roles.includes(session.user.role)) {
    redirect('/unauthorized');
  }
  return session;
}
