import { norm } from '@dossier/shared/format';

export type ItemKind = 'weapon' | 'armor' | 'artifact' | 'container';

export interface FoundCard {
  card: Record<string, unknown>;
  kind: ItemKind;
}

const PREFIXES: { prefix: string; kind: ItemKind }[] = [
  { prefix: 'w', kind: 'weapon' },
  { prefix: 'a', kind: 'armor' },
  { prefix: 'art', kind: 'artifact' },
  { prefix: 'c', kind: 'container' },
];

/** Exact legacy card lookup by `<prefix>:<name>`, then a normalized-name fallback. */
export function findDetailsCard(
  details: Record<string, unknown> | null | undefined,
  prefix: string,
  name: string | null | undefined,
): Record<string, unknown> | null {
  if (!details || !name) return null;
  const direct = details[`${prefix}:${name}`];
  if (direct && typeof direct === 'object') return direct as Record<string, unknown>;

  const wanted = norm(name);
  for (const [key, value] of Object.entries(details)) {
    if (!key.startsWith(`${prefix}:`)) continue;
    if (norm(key.slice(prefix.length + 1)) === wanted && value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

/** Finds a card when the section prefix is unknown, for example a build slot. */
export function findAnyDetailsCard(
  details: Record<string, unknown> | null | undefined,
  name: string | null | undefined,
): FoundCard | null {
  for (const { prefix, kind } of PREFIXES) {
    const card = findDetailsCard(details, prefix, name);
    if (card) return { card, kind };
  }
  return null;
}
