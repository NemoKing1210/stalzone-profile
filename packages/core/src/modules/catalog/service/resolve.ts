import { norm } from '@profile/shared';
import type { Db } from '../../../platform/db/index.js';
import { WriteError } from '../../../platform/journal/index.js';
import * as repo from '../repo/index.js';
import type { ItemRow } from '../repo/items.js';

function distance(a: string, b: string): number {
  const rows = b.length + 1;
  let previous = Array.from({ length: rows }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = (a[i - 1] ?? '') === (b[j - 1] ?? '') ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

function suggestionsFor(db: Db, name: string, kind: string): string[] {
  const query = norm(name);
  return repo
    .listItems(db, kind)
    .map((item) => ({ name: item.name, distance: distance(query, item.name_norm) }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((entry) => entry.name);
}

export function resolveItem(db: Db, name: string, kind: string): ItemRow {
  const item = repo.findItemByKindName(db, kind, name) ?? repo.searchItems(db, { q: name, kind, limit: 1 })[0];
  if (!item) {
    throw new WriteError(422, 'UNKNOWN_ITEM', `Item "${name}" not found`, {
      query: name,
      kind,
      suggestions: suggestionsFor(db, name, kind),
    });
  }
  return item;
}

export function resolveOptionalItem(db: Db, name: string | null | undefined): ItemRow | null {
  if (!name) return null;
  return (
    repo.findItemByKindName(db, 'artifact', name) ??
    repo.findItemByKindName(db, 'weapon', name) ??
    repo.findItemByKindName(db, 'armor', name) ??
    repo.findItemByKindName(db, 'container', name) ??
    repo.searchItems(db, { q: name, limit: 1 })[0] ??
    null
  );
}

/** Skins may only bind by their exact motif name; guessing an "almost same" motif is worse than failing. */
export function resolveMotifExact(db: Db, name: string): ItemRow {
  const item = repo.findItemByKindName(db, 'motif', name);
  if (!item) {
    throw new WriteError(422, 'UNKNOWN_ITEM', `Skin "${name}" not found`, {
      query: name,
      kind: 'motif',
      suggestions: suggestionsFor(db, name, 'motif'),
    });
  }
  return item;
}
