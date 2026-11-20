/** A tile press either only selects the card or asks for its details panel. */
export type TileGesture = 'select' | 'open';

/**
 * A single click selects, a double click opens the item panel. Keeping the mapping
 * here means the grid tile and the equipment slot cannot drift apart.
 */
export function tileGesture(event: 'click' | 'dblclick'): TileGesture {
  return event === 'dblclick' ? 'open' : 'select';
}
