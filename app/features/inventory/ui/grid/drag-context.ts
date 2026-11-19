import type { InjectionKey } from 'vue';
import type { GridDrag } from './useGridDrag';

export const DragKey: InjectionKey<GridDrag> = Symbol('inventory-drag');

/** Shares one drag state with the components that draw it, so the page itself does not re-render. */
export function provideGridDrag(drag: GridDrag): void {
  provide(DragKey, drag);
}

export function useGridDragContext(): GridDrag | null {
  return inject(DragKey, null);
}
