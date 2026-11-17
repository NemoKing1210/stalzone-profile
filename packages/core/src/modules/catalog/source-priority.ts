/** Which source wins when more than one writes the same item stat key (lower wins). */
export const SOURCE_PRIORITY: Record<string, number> = {
  wiki: 0,
  exbo_base: 1,
  scpmodel: 2,
  local: 3,
};

/** Priority of a source id; an unknown or absent source ranks last. */
export function sourcePriority(sourceId: string | null | undefined): number {
  return SOURCE_PRIORITY[sourceId ?? ''] ?? 9;
}
