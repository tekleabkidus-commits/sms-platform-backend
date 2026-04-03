import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const client = new Client({
    host: requireEnv('POSTGRES_HOST'),
    port: Number(requireEnv('POSTGRES_PORT', '5432')),
    user: requireEnv('POSTGRES_USER'),
    password: requireEnv('POSTGRES_PASSWORD'),
    database: requireEnv('POSTGRES_DATABASE'),
    ssl: ['1', 'true', 'TRUE'].includes(process.env.POSTGRES_SSL ?? 'false')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  const filenames = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const filename of filenames) {
    const alreadyApplied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [filename],
    );
    if (alreadyApplied.rowCount) {
      process.stdout.write(`Skipping already-applied migration ${filename}\n`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, filename), 'utf8');
    process.stdout.write(`Applying migration ${filename}\n`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  await client.end();
}

main().catch((error) => {
  process.stderr.write(`Migration failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
