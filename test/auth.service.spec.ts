import { randomBytes, scryptSync } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';

describe('AuthService', () => {
  const metricsService = {
    recordAuthEvent: jest.fn(),
  };

  beforeEach(() => {
    metricsService.recordAuthEvent.mockReset();
  });

  it('validates API keys using the stored salted hash', async () => {
    const auditService = { write: jest.fn().mockResolvedValue(undefined) };
    const jwtService = { signAsync: jest.fn() };
    const configService = { getOrThrow: jest.fn() };
    const databaseService = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [],
        }),
    };
    const service = new AuthService(
      databaseService as never,
      auditService as never,
      jwtService as never,
      configService as never,
      metricsService as never,
    );
    const salt = randomBytes(16);
    const rawKey = 'sk_live_prefix_secret';
    const hash = (service as any).hashApiKey(rawKey, salt);
    databaseService.query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{
          id: 'api-key-1',
          tenant_id: 'tenant-1',
          key_prefix: 'prefix',
          key_hash: hash,
          key_salt: salt,
          name: 'Default',
          scopes: ['sms:send'],
          rate_limit_rps: 10,
          daily_quota: 1000,
          is_active: true,
          expires_at: null,
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await expect(service.validateApiKey(rawKey)).resolves.toMatchObject({
      apiKeyId: 'api-key-1',
      tenantId: 'tenant-1',
      scopes: ['sms:send'],
    });
  });

  it('issues a short-lived re-auth token after password confirmation', async () => {
    const salt = randomBytes(16);
    const password = 'ChangeMe123!';
    const passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 64).toString('hex')}`;
    const auditService = { write: jest.fn().mockResolvedValue(undefined) };
    const jwtService = { signAsync: jest.fn().mockResolvedValue('reauth-token') };
    const configService = { getOrThrow: jest.fn().mockReturnValue('private-key') };
    const databaseService = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: 'user-1',
          tenant_id: 'tenant-1',
          email: 'admin@example.com',
          password_hash: passwordHash,
          is_active: true,
        }],
      }),
    };
    const service = new AuthService(
      databaseService as never,
      auditService as never,
      jwtService as never,
      configService as never,
      metricsService as never,
    );

    await expect(service.reauthenticate({
      sub: 'user-1',
      tenantId: 'tenant-1',
      homeTenantId: 'tenant-1',
      role: 'admin',
      email: 'admin@example.com',
    }, { password })).resolves.toMatchObject({
      reauthToken: 'reauth-token',
      expiresInSeconds: 300,
    });

    expect(jwtService.signAsync).toHaveBeenCalled();
    expect(auditService.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 'auth.reauth.succeeded',
      tenantId: 'tenant-1',
      userId: 'user-1',
    }));
  });

  it('rejects invalid password confirmation attempts', async () => {
    const salt = randomBytes(16);
    const passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync('ChangeMe123!', salt, 64).toString('hex')}`;
    const auditService = { write: jest.fn().mockResolvedValue(undefined) };
    const jwtService = { signAsync: jest.fn() };
    const configService = { getOrThrow: jest.fn().mockReturnValue('private-key') };
    const databaseService = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: 'user-1',
          tenant_id: 'tenant-1',
          email: 'admin@example.com',
          password_hash: passwordHash,
          is_active: true,
        }],
      }),
    };
    const service = new AuthService(
      databaseService as never,
      auditService as never,
      jwtService as never,
      configService as never,
      metricsService as never,
    );

    await expect(service.reauthenticate({
      sub: 'user-1',
      tenantId: 'tenant-1',
      homeTenantId: 'tenant-1',
      role: 'admin',
      email: 'admin@example.com',
    }, { password: 'WrongPass1!' })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditService.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 'auth.reauth.failed',
      tenantId: 'tenant-1',
      userId: 'user-1',
    }));
  });
});
