import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function parseEnvValue(rawValue) {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseEnvFile(contents) {
  const parsed = new Map();
  const lines = contents.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);
    parsed.set(key, parseEnvValue(value));
  }

  return parsed;
}

export function loadLocalEnv({ cwd = process.cwd() } = {}) {
  const candidates = ['.env', '.env.local'];

  for (const filename of candidates) {
    const fullPath = path.join(cwd, filename);
    if (!existsSync(fullPath)) {
      continue;
    }

    const parsed = parseEnvFile(readFileSync(fullPath, 'utf8'));
    for (const [key, value] of parsed.entries()) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}
