const LOCAL_BACKEND_BASE_URL = 'http://localhost:3000/api/v1';
const LOCAL_SWAGGER_URL = 'http://localhost:3000/api/v1/docs';

function currentAppEnv(): string {
  return (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? '').trim().toLowerCase();
}

function shouldRequireHostedConfig(): boolean {
  return ['staging', 'production'].includes(currentAppEnv());
}

function getConfiguredValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function getHostedEnvError(name: string, description: string): Error {
  return new Error(`${name} must be set for hosted deployments. ${description}`);
}

export function getBackendBaseUrl(): string {
  const configured = getConfiguredValue('BACKEND_BASE_URL');
  if (configured) {
    return configured;
  }

  if (shouldRequireHostedConfig()) {
    throw getHostedEnvError(
      'BACKEND_BASE_URL',
      'Use the backend Railway public domain, for example https://${{sms-platform-backend.RAILWAY_PUBLIC_DOMAIN}}/api/v1.',
    );
  }

  return LOCAL_BACKEND_BASE_URL;
}

export function getSwaggerUrl(): string {
  const configured = getConfiguredValue('NEXT_PUBLIC_BACKEND_SWAGGER_URL');
  if (configured) {
    return configured;
  }

  if (shouldRequireHostedConfig()) {
    throw getHostedEnvError(
      'NEXT_PUBLIC_BACKEND_SWAGGER_URL',
      'Use the backend Railway public domain, for example https://${{sms-platform-backend.RAILWAY_PUBLIC_DOMAIN}}/api/v1/docs.',
    );
  }

  return LOCAL_SWAGGER_URL;
}
