'use client';

import { loadVersionedLocalState, saveVersionedLocalState } from './local-persistence';

const STORAGE_PREFIX = 'sms-cp:notifications:read';
const CURRENT_VERSION = 2;

function buildCurrentKey(userId: string, tenantId: string): string {
  return `${STORAGE_PREFIX}:v${CURRENT_VERSION}:${userId}:${tenantId}`;
}

function buildLegacyKeys(userId: string, tenantId: string): string[] {
  return [`${STORAGE_PREFIX}:v1:${userId}:${tenantId}`];
}

function normalizeReadIds(value: unknown): string[] | null {
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return [...new Set(value)];
  }

  if (
    typeof value === 'object'
    && value !== null
    && 'readIds' in value
    && Array.isArray((value as { readIds?: unknown[] }).readIds)
  ) {
    return normalizeReadIds((value as { readIds?: unknown[] }).readIds ?? []);
  }

  return null;
}

export function loadNotificationReadIds(userId: string, tenantId: string): string[] {
  return loadVersionedLocalState({
    key: buildCurrentKey(userId, tenantId),
    version: CURRENT_VERSION,
    defaultValue: [] as string[],
    legacyKeys: buildLegacyKeys(userId, tenantId),
    migrateLegacy: normalizeReadIds,
  });
}

export function saveNotificationReadIds(userId: string, tenantId: string, readIds: string[]): void {
  saveVersionedLocalState(buildCurrentKey(userId, tenantId), CURRENT_VERSION, [...new Set(readIds)]);
}
