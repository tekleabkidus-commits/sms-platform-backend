import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const MIGRATION_LOCK_A = 932451;
const MIGRATION_LOCK_B = 20260403;

export function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  return ['1', 'true', 'TRUE', 'yes', 'YES'].includes(value);
}

export function buildPgConfig({ database } = {}) {
  return {
    host: requireEnv('POSTGRES_HOST'),
    port: Number(requireEnv('POSTGRES_PORT', '5432')),
    user: requireEnv('POSTGRES_USER'),
    password: requireEnv('POSTGRES_PASSWORD'),
    database: database ?? requireEnv('POSTGRES_DATABASE'),
    ssl: parseBoolean(process.env.POSTGRES_SSL, false)
      ? { rejectUnauthorized: false }
      : undefined,
  };
}

export async function ensureDatabaseExists({ createIfMissing = false } = {}) {
  const targetDatabase = requireEnv('POSTGRES_DATABASE');
  const adminDatabase = requireEnv('POSTGRES_ADMIN_DATABASE', 'postgres');
  const adminClient = new Client(buildPgConfig({ database: adminDatabase }));

  await adminClient.connect();
  try {
    const existing = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDatabase],
    );

    if (existing.rowCount) {
      return { created: false, database: targetDatabase };
    }

    if (!createIfMissing) {
      throw new Error(
        `Database "${targetDatabase}" does not exist. Set POSTGRES_CREATE_DATABASE_IF_MISSING=true or create it manually first.`,
      );
    }

    const safeDatabaseName = targetDatabase.replace(/"/g, '""');
    await adminClient.query(`CREATE DATABASE "${safeDatabaseName}"`);
    return { created: true, database: targetDatabase };
  } finally {
    await adminClient.end();
  }
}

export async function runMigrations({ cwd = process.cwd(), log = process.stdout.write.bind(process.stdout) } = {}) {
  const client = new Client(buildPgConfig());
  const migrationsDir = path.resolve(cwd, 'migrations');
  const filenames = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [MIGRATION_LOCK_A, MIGRATION_LOCK_B]);
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
        log(`Skipping already-applied migration ${filename}\n`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, filename), 'utf8');
      log(`Applying migration ${filename}\n`);
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

    return { appliedCount: filenames.length };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [MIGRATION_LOCK_A, MIGRATION_LOCK_B]);
    } catch {
      // connection may already be closing
    }
    await client.end();
  }
}

export async function verifyDatabaseSchema() {
  const client = new Client(buildPgConfig());
  const requiredTables = [
    'tenants',
    'users',
    'wallets',
    'providers',
    'routing_rules',
    'pricing_rules',
    'messages',
    'message_logs',
    'transactions',
    'outbox_events',
    'dlr_webhooks',
    'campaigns',
    'campaign_jobs',
    'contacts',
    'contact_groups',
    'api_keys',
    'sender_ids',
    'retry_policies',
    'provider_circuit_state',
    'audit_logs',
    'schema_migrations',
  ];

  await client.connect();
  try {
    const tableResult = await client.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `,
    );
    const existingTables = new Set(tableResult.rows.map((row) => row.table_name));

    for (const tableName of requiredTables) {
      if (!existingTables.has(tableName)) {
        throw new Error(`Required table "${tableName}" is missing from the target database.`);
      }
    }

    const versionResult = await client.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name IN ('version', 'state_changed_at')
      `,
    );

    const columns = new Set(versionResult.rows.map((row) => row.column_name));
    if (!columns.has('version') || !columns.has('state_changed_at')) {
      throw new Error('messages.version and messages.state_changed_at must both exist.');
    }

    const migrationCount = await client.query('SELECT COUNT(*)::int AS count FROM schema_migrations');

    return {
      requiredTables: requiredTables.length,
      migrationsApplied: migrationCount.rows[0]?.count ?? 0,
    };
  } finally {
    await client.end();
  }
}
