import { getBackendBaseUrl, getSwaggerUrl } from '../lib/runtime-env';

describe('runtime env helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.BACKEND_BASE_URL;
    delete process.env.NEXT_PUBLIC_BACKEND_SWAGGER_URL;
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.APP_ENV;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('falls back to localhost values for local development when hosted env markers are absent', () => {
    expect(getBackendBaseUrl()).toBe('http://localhost:3000/api/v1');
    expect(getSwaggerUrl()).toBe('http://localhost:3000/api/v1/docs');
  });

  it('requires explicit backend URLs for staging and production-style environments', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'production';

    expect(() => getBackendBaseUrl()).toThrow('BACKEND_BASE_URL must be set for hosted deployments');
    expect(() => getSwaggerUrl()).toThrow('NEXT_PUBLIC_BACKEND_SWAGGER_URL must be set for hosted deployments');
  });

  it('returns configured hosted values when present', () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    process.env.BACKEND_BASE_URL = 'http://api.internal/api/v1';
    process.env.NEXT_PUBLIC_BACKEND_SWAGGER_URL = 'https://api.example.com/api/v1/docs';

    expect(getBackendBaseUrl()).toBe('http://api.internal/api/v1');
    expect(getSwaggerUrl()).toBe('https://api.example.com/api/v1/docs');
  });
});
