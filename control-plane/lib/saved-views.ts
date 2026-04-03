'use client';

import { useMemo, useState } from 'react';
import { SavedViewDefinition } from './api-types';
import { loadVersionedLocalState, saveVersionedLocalState } from './local-persistence';
import { useSessionData } from './session-context';

const STORAGE_PREFIX = 'sms-cp:saved-views';
const CURRENT_VERSION = 2;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function uniqueId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeViews(value: unknown): SavedViewDefinition[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const candidate = entry as Partial<SavedViewDefinition>;
    if (
      typeof candidate.id !== 'string'
      || typeof candidate.name !== 'string'
      || typeof candidate.createdAt !== 'string'
      || typeof candidate.updatedAt !== 'string'
      || typeof candidate.isDefault !== 'boolean'
      || typeof candidate.filters !== 'object'
      || candidate.filters === null
    ) {
      return [];
    }

    const filters = Object.fromEntries(
      Object.entries(candidate.filters).filter((item): item is [string, string] => typeof item[1] === 'string'),
    );

    return [{
      id: candidate.id,
      name: candidate.name,
      filters,
      isDefault: candidate.isDefault,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    }];
  });

  return normalized;
}

export function useSavedViews(pageKey: string) {
  const session = useSessionData();
  const currentStorageKey = useMemo(
    () => `${STORAGE_PREFIX}:v${CURRENT_VERSION}:${session.user.id}:${session.tenant.id}:${pageKey}`,
    [pageKey, session.tenant.id, session.user.id],
  );
  const storageKey = useMemo(
    () => `${STORAGE_PREFIX}:v1:${session.user.id}:${session.tenant.id}:${pageKey}`,
    [pageKey, session.tenant.id, session.user.id],
  );
  const [revision, setRevision] = useState(0);

  const views = useMemo(() => {
    void revision;
    if (!isBrowser()) {
      return [] as SavedViewDefinition[];
    }

    return loadVersionedLocalState({
      key: currentStorageKey,
      version: CURRENT_VERSION,
      defaultValue: [] as SavedViewDefinition[],
      legacyKeys: [storageKey],
      migrateLegacy: normalizeViews,
    });
  }, [currentStorageKey, revision, storageKey]);

  const persist = (nextViews: SavedViewDefinition[]) => {
    saveVersionedLocalState(currentStorageKey, CURRENT_VERSION, nextViews);
    setRevision((current) => current + 1);
  };

  const saveView = (name: string, filters: Record<string, string>, setDefault = false) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Saved view name is required');
    }

    const now = new Date().toISOString();
    const existing = views.find((view) => view.name.toLowerCase() === trimmedName.toLowerCase());
    const base = views.map((view) => ({
      ...view,
      isDefault: setDefault ? false : view.isDefault,
    }));

    if (existing) {
      persist(base.map((view) => (view.id === existing.id ? {
        ...view,
        filters,
        isDefault: setDefault ? true : view.isDefault,
        updatedAt: now,
      } : view)));
      return existing.id;
    }

    const created: SavedViewDefinition = {
      id: uniqueId(),
      name: trimmedName,
      filters,
      isDefault: setDefault,
      createdAt: now,
      updatedAt: now,
    };
    persist([created, ...base]);
    return created.id;
  };

  const removeView = (id: string) => {
    persist(views.filter((view) => view.id !== id));
  };

  const setDefaultView = (id: string | null) => {
    persist(views.map((view) => ({
      ...view,
      isDefault: id ? view.id === id : false,
      updatedAt: view.id === id ? new Date().toISOString() : view.updatedAt,
    })));
  };

  return {
    views,
    defaultView: views.find((view) => view.isDefault) ?? null,
    saveView,
    removeView,
    setDefaultView,
  };
}
