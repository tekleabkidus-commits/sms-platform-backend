import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_ROLES = new Set([
  'api',
  'worker-dispatch',
  'worker-dlr',
  'worker-outbox',
  'worker-campaign',
  'worker-fraud',
  'worker-reconciliation',
]);

function printUsage() {
  console.error(`
Usage:
  node scripts/start-role.mjs <role>

Valid roles:
  api
  worker-dispatch
  worker-dlr
  worker-outbox
  worker-campaign
  worker-fraud
  worker-reconciliation
`);
}

const role = process.argv[2];
if (!role || !VALID_ROLES.has(role)) {
  printUsage();
  process.exit(1);
}

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');
const entrypoint = path.join(rootDir, 'dist', 'main.js');

if (!existsSync(entrypoint)) {
  console.error(
    `Compiled entrypoint not found at ${entrypoint}. Run "npm run build" before starting ${role}.`,
  );
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [entrypoint],
  {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_ROLE: role,
    },
  },
);

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
