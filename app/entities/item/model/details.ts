import { norm } from '@profile/shared/format';

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
