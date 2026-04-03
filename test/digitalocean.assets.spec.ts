import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('DigitalOcean App Platform assets', () => {
  const root = path.resolve(__dirname, '..');

  it('includes the App Platform template, deployment guide, and staging account guide', () => {
    const requiredPaths = [
      '.do/deploy.template.yaml',
      'docs/deployment/digitalocean-app-platform.md',
      'docs/deployment/staging-test-accounts.md',
      'scripts/start-role.mjs',
      'scripts/seed-staging-test-users.mjs',
    ];

    for (const relativePath of requiredPaths) {
      expect(existsSync(path.join(root, relativePath))).toBe(true);
    }
  });

  it('describes the expected GitHub-backed App Platform components', () => {
    const template = readFileSync(path.join(root, '.do', 'deploy.template.yaml'), 'utf8');
    expect(template).toContain('name: x-sms');
    expect(template).toContain('region: fra');
    expect(template).toContain('repo_clone_url: https://github.com/tekleabkidus-commits/sms-platform-backend');
    expect(template).toContain('source_dir: control-plane');
    expect(template).toContain('run_command: npm run start:api');
    expect(template).toContain('run_command: npm run start:worker-dispatch');
    expect(template).toContain('run_command: npm run start:worker-dlr');
    expect(template).toContain('run_command: npm run start:worker-outbox');
    expect(template).toContain('run_command: npm run start:worker-campaign');
    expect(template).toContain('run_command: npm run start:worker-fraud');
    expect(template).toContain('run_command: npm run start:worker-reconciliation');
    expect(template).toContain('prefix: /backend');
  });

  it('prints a staging seed plan without mutating the database', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/seed-staging-test-users.mjs', '--plan'],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          APP_ENV: 'staging',
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"tenantCode": "staging"');
    expect(result.stdout).toContain('"email": "owner@x-sms.local"');
    expect(result.stdout).toContain('"role": "viewer"');
    expect(result.stdout).toContain('"sharedPassword": "xSMS-Staging-2026!FRA#7NqLm4Pz"');
  });

  it('refuses to seed staging users when the environment is production', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/seed-staging-test-users.mjs'],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          APP_ENV: 'production',
          ALLOW_STAGING_TEST_USER_SEED: 'true',
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('blocked when APP_ENV or NODE_ENV is production');
  });
});
