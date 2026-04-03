'use client';

interface VersionedEnvelope<T> {
  version: number;
  updatedAt: string;
  value: T;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isEnvelope<T>(value: unknown): value is VersionedEnvelope<T> {
  return typeof value === 'object' && value !== null && 'version' in value && 'value' in value;
}

export function loadVersionedLocalState<T>({
  key,
  version,
  defaultValue,
  legacyKeys = [],
  migrateLegacy,
}: {
  key: string;
  version: number;
  defaultValue: T;
  legacyKeys?: string[];
  migrateLegacy?: (value: unknown) => T | null;
}): T {
  if (!isBrowser()) {
    return defaultValue;
  }

  const tryRead = (candidateKey: string): unknown => {
    const raw = window.localStorage.getItem(candidateKey);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as unknown;
    } catch {
      window.localStorage.removeItem(candidateKey);
      return null;
    }
  };

  const current = tryRead(key);
  if (isEnvelope<T>(current) && current.version === version) {
    return current.value;
  }

  const legacyValues = [current, ...legacyKeys.map((legacyKey) => tryRead(legacyKey))];
  for (const legacyValue of legacyValues) {
    if (legacyValue == null || !migrateLegacy) {
      continue;
    }

    const migrated = migrateLegacy(legacyValue);
    if (migrated != null) {
      saveVersionedLocalState(key, version, migrated);
      legacyKeys.forEach((legacyKey) => window.localStorage.removeItem(legacyKey));
      return migrated;
    }
  }

  return defaultValue;
}

export function saveVersionedLocalState<T>(key: string, version: number, value: T): void {
  if (!isBrowser()) {
    return;
  }

  const envelope: VersionedEnvelope<T> = {
    version,
    updatedAt: new Date().toISOString(),
    value,
  };
  window.localStorage.setItem(key, JSON.stringify(envelope));
}
