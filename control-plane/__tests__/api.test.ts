import { AUTH_REQUIRED_EVENT } from '@/lib/request-events';
import { ApiError, apiRequest, loginRequest, reauthRequest, switchTenantRequest } from '@/lib/api';

describe('api client helpers', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('throws ApiError with backend message for failed requests', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Forbidden' }),
    });

    await expect(apiRequest('/dashboard/tenant')).rejects.toMatchObject({
      message: 'Forbidden',
      status: 403,
    });
  });

  it('submits login requests to the auth route', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ user: {}, tenant: {}, availableTenants: [] }),
    });

    await loginRequest({
      tenantCode: 'acme-et',
      email: 'owner@example.com',
      password: 'ChangeMe123!',
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('submits tenant-switch requests to the auth route', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ user: {}, tenant: {}, availableTenants: [] }),
    });

    await switchTenantRequest({ tenantId: 'tenant-2' });

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/switch-tenant', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('dispatches an auth-required event on 401 responses', async () => {
    const listener = jest.fn();
    window.addEventListener(AUTH_REQUIRED_EVENT, listener as EventListener);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json', 'x-request-id': 'req-1' }),
      json: async () => ({ message: 'Session expired' }),
    });

    await expect(apiRequest('/dashboard/tenant')).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalled();

    window.removeEventListener(AUTH_REQUIRED_EVENT, listener as EventListener);
  });

  it('submits password confirmations to the re-auth route', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ reauthToken: 'token', expiresInSeconds: 300 }),
    });

    await reauthRequest({ password: 'ChangeMe123!' });

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/re-auth', expect.objectContaining({
      method: 'POST',
    }));
  });
});
