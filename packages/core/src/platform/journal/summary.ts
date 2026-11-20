import type { EventSummary } from '@profile/shared/contracts';

/** A summary lists at most this many field names; an update is never a full snapshot. */
export const SUMMARY_FIELD_LIMIT = 20;

/** `before`/`after` are arbitrary JSON snapshots, so a plain-object check is the boundary. */
function plainObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function changedFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  if (!before || !after) return [];
  const changed: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    changed.push(key);
    if (changed.length === SUMMARY_FIELD_LIMIT) break;
  }
  return changed;
}

/**
 * Coarse, deterministic description of a change. It is derived from the same values that
 * are stored in `before`/`after`, so it can never disagree with the rollback snapshot, and
 * it never replaces those columns.
 */
export function summarizeEvent(action: string, before: unknown, after: unknown): EventSummary {
  const beforeObject = plainObject(before);
  const afterObject = plainObject(after);
  if (action === 'rollback') return { kind: 'rollback', fields: changedFields(beforeObject, afterObject) };
  if (before == null && after == null) return { kind: 'update', fields: [] };
  if (before == null) return { kind: 'create', fields: Object.keys(afterObject ?? {}).slice(0, SUMMARY_FIELD_LIMIT) };
  if (after == null) {
    const cleared = /\.(clear|all)$/.test(action);
    return {
      kind: cleared ? 'clear' : 'delete',
      fields: Object.keys(beforeObject ?? {}).slice(0, SUMMARY_FIELD_LIMIT),
    };
  }
  return { kind: 'update', fields: changedFields(beforeObject, afterObject) };
}
