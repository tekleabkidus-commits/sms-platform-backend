import process from 'node:process';
import { loadLocalEnv } from './lib/env-loader.mjs';
import {
  ensureDatabaseExists,
  parseBoolean,
  requireEnv,
  runMigrations,
  verifyDatabaseSchema,
} from './lib/migration-runner.mjs';

loadLocalEnv();

function printUsage() {
  console.log(`
Usage:
  node scripts/prepare-database.mjs
  node scripts/prepare-database.mjs --plan

This script makes the PostgreSQL database ready by:
  1. verifying or creating the target database
  2. applying migrations
  3. verifying the required schema

Relevant environment variables:
  POSTGRES_HOST
  POSTGRES_PORT
  POSTGRES_USER
  POSTGRES_PASSWORD
  POSTGRES_DATABASE
  POSTGRES_ADMIN_DATABASE (default: postgres)
  POSTGRES_CREATE_DATABASE_IF_MISSING (default: true outside production)
`);
}

function resolveCreateIfMissing() {
  if (process.env.POSTGRES_CREATE_DATABASE_IF_MISSING !== undefined) {
    return parseBoolean(process.env.POSTGRES_CREATE_DATABASE_IF_MISSING, false);
  }

  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development').toLowerCase();
  return appEnv !== 'production';
}

function buildPlan() {
  return {
    database: {
      host: requireEnv('POSTGRES_HOST', 'localhost'),
      port: Number(requireEnv('POSTGRES_PORT', '5432')),
      user: requireEnv('POSTGRES_USER', 'postgres'),
      database: requireEnv('POSTGRES_DATABASE', 'sms_platform'),
      adminDatabase: requireEnv('POSTGRES_ADMIN_DATABASE', 'postgres'),
      createIfMissing: resolveCreateIfMissing(),
      ssl: parseBoolean(process.env.POSTGRES_SSL, false),
    },
    actions: ['ensure database exists', 'apply migrations', 'verify schema'],
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    printUsage();
    return;
  }

  if (args.has('--plan')) {
    console.log(JSON.stringify(buildPlan(), null, 2));
    return;
  }

  const createIfMissing = resolveCreateIfMissing();
  const databaseState = await ensureDatabaseExists({ createIfMissing });
  await runMigrations();
  const verification = await verifyDatabaseSchema();

  console.log(JSON.stringify({
    status: 'ready',
    database: {
      name: requireEnv('POSTGRES_DATABASE', 'sms_platform'),
      created: databaseState.created,
      createIfMissing,
    },
    verification,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
