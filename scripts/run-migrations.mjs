import process from 'node:process';
import { loadLocalEnv } from './lib/env-loader.mjs';
import { runMigrations } from './lib/migration-runner.mjs';

async function main() {
  loadLocalEnv();
  await runMigrations();
}

main().catch((error) => {
  process.stderr.write(`Migration failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
