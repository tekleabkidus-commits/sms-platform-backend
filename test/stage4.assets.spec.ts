import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('Stage 4 assets', () => {
  const root = path.resolve(__dirname, '..');

  it('includes deployment and load-testing assets', () => {
    const requiredPaths = [
      'Dockerfile',
      'docker-compose.yml',
      '.github/workflows/ci.yml',
      '.github/workflows/deploy.yml',
      '.do/deploy.template.yaml',
      'k8s/base/kustomization.yaml',
      'k8s/overlays/staging/kustomization.yaml',
      'k8s/overlays/production/kustomization.yaml',
      'k8s/jobs/migration-job.yaml',
      'monitoring/grafana/sms-platform-overview.json',
      'load/k6/single-submit.js',
      'load/k6/mixed-workload.js',
      'scripts/run-migrations.mjs',
      'scripts/seed-local-admin.mjs',
      'scripts/seed-staging-test-users.mjs',
      'scripts/start-role.mjs',
      'scripts/smoke-check.mjs',
      'control-plane/Dockerfile',
      'docs/deployment/digitalocean-app-platform.md',
      'docs/deployment/staging-test-accounts.md',
    ];

    for (const relativePath of requiredPaths) {
      expect(existsSync(path.join(root, relativePath))).toBe(true);
    }
  });

  it('guards load tests against accidental production targeting', () => {
    const mixedWorkload = readFileSync(path.join(root, 'load/k6/lib/helpers.js'), 'utf8');
    expect(mixedWorkload).toContain('ALLOW_PRODUCTION_TARGET');
    expect(mixedWorkload).toContain('Refusing to run');
  });

  it('documents migration and rollback runbooks', () => {
    const migrationRunbook = readFileSync(path.join(root, 'docs/runbooks/migrations.md'), 'utf8');
    const rollbackRunbook = readFileSync(path.join(root, 'docs/runbooks/rollback.md'), 'utf8');
    const localDeployment = readFileSync(path.join(root, 'docs/deployment/local.md'), 'utf8');
    const digitalOceanDeployment = readFileSync(path.join(root, 'docs/deployment/digitalocean-app-platform.md'), 'utf8');
    expect(migrationRunbook).toContain('k8s/jobs/migration-job.yaml');
    expect(rollbackRunbook).toContain('rollout undo');
    expect(localDeployment).toContain('npm run seed:local');
    expect(localDeployment).toContain('admin@example.com');
    expect(digitalOceanDeployment).toContain('.do/deploy.template.yaml');
    expect(digitalOceanDeployment).toContain('ALLOW_STAGING_TEST_USER_SEED=true');
  });
});
