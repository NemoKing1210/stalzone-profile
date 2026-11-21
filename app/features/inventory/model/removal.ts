/**
 * A delete keeps at least one piece and never asks for more than the stack holds.
 * The modal and the screen both guard through this helper, so a stale quantity or an
 * empty number input cannot turn into an over-delete.
 */
export function clampRemoveQty(available: number, requested: number): number {
  const max = Math.max(1, Math.trunc(Number.isFinite(available) ? available : 1));
  const value = Math.trunc(Number.isFinite(requested) ? requested : 1);
  return Math.min(max, Math.max(1, value));
}
