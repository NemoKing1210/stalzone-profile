import { norm } from '@dossier/shared/format';

const PREFIXES = ['w', 'a', 'art', 'c'] as const;

export type ItemKind = 'weapon' | 'armor' | 'artifact' | 'container';

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
): { card: Record<string, unknown>; kind: ItemKind } | null {
  const KINDS: Record<(typeof PREFIXES)[number], ItemKind> = {
    w: 'weapon',
    a: 'armor',
    art: 'artifact',
    c: 'container',
  };
  for (const prefix of PREFIXES) {
    const card = findDetailsCard(details, prefix, name);
    if (card) return { card, kind: KINDS[prefix] };
  }
  return null;
}
