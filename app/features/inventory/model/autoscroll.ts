import type { Point } from './drag';
import type { Size } from './grid';

export interface ScrollVelocity {
  x: number;
  y: number;
}

/**
 * Pixels to scroll per frame while a drag sits near the viewport edge. The speed ramps
 * from zero at the margin to `max` at the edge, and a pointer outside the viewport keeps
 * the maximum, so dragging past the window does not stall.
 */
export function scrollVelocity(pointer: Point, viewport: Size, margin = 48, max = 18): ScrollVelocity {
  function axis(position: number, size: number): number {
    if (size <= 0) return 0;
    const clamped = Math.min(Math.max(position, 0), size);
    const edge = Math.min(clamped, size - clamped);
    if (edge >= margin) return 0;
    const strength = Math.min(1, (margin - edge) / margin);
    const direction = clamped < size / 2 ? -1 : 1;
    return direction * Math.ceil(max * strength);
  }
  return { x: axis(pointer.x, viewport.width), y: axis(pointer.y, viewport.height) };
}
