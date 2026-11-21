import { rankColor } from '@profile/shared/ranks';

/**
 * The translucent rank edge used by item icon wells and grid tiles. The rank token is a CSS
 * custom property, so the mix resolves per theme; an unknown rank keeps the plain strong border.
 */
export function itemEdgeColor(raw: string | null | undefined): string {
  const color = rankColor(raw);
  return color ? `color-mix(in srgb, ${color} 70%, transparent)` : 'var(--sz-border-strong)';
}
