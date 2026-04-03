import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('Database preparation script', () => {
  const root = path.resolve(__dirname, '..');

  it('prints a bootstrap plan without requiring a live database', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/prepare-database.mjs', '--plan'],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          POSTGRES_HOST: 'localhost',
          POSTGRES_PORT: '5432',
          POSTGRES_USER: 'postgres',
          POSTGRES_PASSWORD: 'postgres',
          POSTGRES_DATABASE: 'sms_platform',
          POSTGRES_ADMIN_DATABASE: 'postgres',
          POSTGRES_CREATE_DATABASE_IF_MISSING: 'true',
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"database": "sms_platform"');
    expect(result.stdout).toContain('"adminDatabase": "postgres"');
    expect(result.stdout).toContain('"createIfMissing": true');
    expect(result.stdout).toContain('"verify schema"');
  });
});
