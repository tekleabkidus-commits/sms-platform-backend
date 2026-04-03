'use client';

import { useState } from 'react';
import { BookmarkPlus, BookmarkCheck, Trash2 } from 'lucide-react';
import { SavedViewDefinition } from '@/lib/api-types';
import { Button, Input } from './primitives';

export function SavedViewsManager({
  views,
  onSave,
  onLoad,
  onDelete,
  onSetDefault,
}: {
  views: SavedViewDefinition[];
  onSave: (name: string, setDefault: boolean) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string | null) => void;
}): React.ReactElement {
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-56 flex-1">
        <Input
          placeholder="Save current filters as a view"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={makeDefault}
          onChange={(event) => setMakeDefault(event.target.checked)}
        />
        Default
      </label>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          onSave(name, makeDefault);
          setName('');
          setMakeDefault(false);
        }}
        disabled={!name.trim()}
      >
        <BookmarkPlus className="size-4" />
        Save view
      </Button>
      <div className="min-w-56 flex-1">
        <select
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">Saved views</option>
          {views.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}{view.isDefault ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" variant="ghost" disabled={!selectedId} onClick={() => selectedId && onLoad(selectedId)}>
        <BookmarkCheck className="size-4" />
        Apply
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={!selectedId}
        onClick={() => onSetDefault(selectedId || null)}
      >
        Set default
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={!selectedId}
        onClick={() => selectedId && onDelete(selectedId)}
      >
        <Trash2 className="size-4" />
        Delete
      </Button>
    </div>
  );
}
