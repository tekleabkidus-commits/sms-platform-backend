/** @jest-environment node */

import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

describe('request proxy auth handling', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('redirects protected routes to login when the session token is invalid', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const request = new NextRequest('http://127.0.0.1:3001/dashboard', {
      headers: {
        cookie: 'sms_cp_token=expired:tenant-1',
      },
    });

    const response = await proxy(request);
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    expect(location).not.toBeNull();
    expect(new URL(location ?? 'http://localhost').pathname).toBe('/login');
    expect(new URL(location ?? 'http://localhost').searchParams.get('reason')).toBe('session-expired');
    expect(response.cookies.get('sms_cp_token')?.value).toBe('');
  });

  it('redirects valid authenticated users away from the login page', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    const request = new NextRequest('http://127.0.0.1:3001/login', {
      headers: {
        cookie: 'sms_cp_token=token:tenant-1',
      },
    });

    const response = await proxy(request);
    const location = response.headers.get('location');

    expect(response.status).toBe(307);
    expect(location).not.toBeNull();
    expect(new URL(location ?? 'http://localhost').pathname).toBe('/dashboard');
  });

  it('clears invalid cookies on the login page without redirecting away from sign in', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const request = new NextRequest('http://127.0.0.1:3001/login', {
      headers: {
        cookie: 'sms_cp_token=expired:tenant-1',
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.cookies.get('sms_cp_token')?.value).toBe('');
  });
});
