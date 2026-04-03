import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('Railway deployment assets', () => {
  const root = path.resolve(__dirname, '..');

  it('includes Railway config, docs, and variable templates', () => {
    const requiredPaths = [
      '.railway/backend/railway.json',
      'control-plane/railway.json',
      'docs/deployment/railway.md',
      'RAILWAY_VARIABLES_BACKEND.env',
      'RAILWAY_VARIABLES_FRONTEND.env',
      'RAILWAY_VARIABLES_WORKERS.env',
      'RAILWAY_VARIABLES_CHECKLIST.md',
      'docs/deployment/staging-test-accounts.md',
      'scripts/seed-staging-test-users.mjs',
    ];

    for (const relativePath of requiredPaths) {
      expect(existsSync(path.join(root, relativePath))).toBe(true);
    }
  });

  it('documents Railway service references and source directories', () => {
    const guide = readFileSync(path.join(root, 'docs', 'deployment', 'railway.md'), 'utf8');
    const backendEnv = readFileSync(path.join(root, 'RAILWAY_VARIABLES_BACKEND.env'), 'utf8');
    const frontendEnv = readFileSync(path.join(root, 'RAILWAY_VARIABLES_FRONTEND.env'), 'utf8');
    const workersEnv = readFileSync(path.join(root, 'RAILWAY_VARIABLES_WORKERS.env'), 'utf8');

    expect(guide).toContain('root directory: `/`');
    expect(guide).toContain('root directory: `/control-plane`');
    expect(guide).toContain('/.railway/backend/railway.json');
    expect(guide).toContain('/control-plane/railway.json');
    expect(backendEnv).toContain('POSTGRES_HOST=${{postgres.PGHOST}}');
    expect(backendEnv).toContain('CORS_ALLOWED_ORIGINS=https://${{control-plane.RAILWAY_PUBLIC_DOMAIN}}');
    expect(frontendEnv).toContain('BACKEND_BASE_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}/api/v1');
    expect(frontendEnv).toContain('NEXT_PUBLIC_BACKEND_SWAGGER_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}/api/v1/docs');
    expect(workersEnv).toContain('APP_ROLE=worker-dispatch');
  });

  it('keeps staging test-user instructions Railway-safe', () => {
    const stagingDoc = readFileSync(path.join(root, 'docs', 'deployment', 'staging-test-accounts.md'), 'utf8');
    expect(stagingDoc).toContain('api service shell');
    expect(stagingDoc).toContain('ALLOW_STAGING_TEST_USER_SEED=true');
    expect(stagingDoc).toContain('must never be seeded into or used from a production environment');
  });
});
