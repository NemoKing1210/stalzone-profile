import type { EquipmentSlot, InventoryItemRead, ModuleSlot } from '@profile/shared/contracts';
import { EquipmentSlotSchema, ModuleSlotSchema } from '@profile/shared/contracts';

import { isSameTarget, keyboardTarget, pointerToCell, type DropTarget, type Point } from '../../model/drag';

/** Pixels a press must travel before it becomes a drag; below this it stays a click. */
const DRAG_THRESHOLD = 6;

export interface GridDragOptions {
  onDrop: (itemId: number, target: DropTarget, rotated: boolean) => void | Promise<void>;
  /** Grid dimensions for a storage id, used while the pointer is over its cells. */
  storageAt: (storageId: number) => { width: number; height: number } | null;
  /** Grid a non-grid item lands on when picked up with the keyboard. */
  homeStorageId: () => number | null;
}

export interface DragGhost {
  x: number;
  y: number;
  storageId: number;
}

/**
 * One drag state for the whole inventory screen: pointer drags (mouse and touch)
 * and the keyboard ghost share it, so an item picked in one grid can be dropped
 * in another, on an equipment slot, in a container or on a weapon module.
 */
export function useGridDrag(options: GridDragOptions) {
  const picked = ref<InventoryItemRead | null>(null);
  const rotated = ref(false);
  const ghost = ref<DragGhost | null>(null);
  const target = ref<DropTarget | null>(null);
  const pointer = ref<Point | null>(null);

  let press: { item: InventoryItemRead; x: number; y: number; touch: boolean } | null = null;
  /** A touch tap starts a pick; its own pointerup must not drop it straight back. */
  let ignoringPointerUp = false;
  /** The keydown that picked an item; the same event must not immediately drop it. */
  let pickEvent: KeyboardEvent | null = null;
  /** A completed pointer drag ends with a click on whatever is under the pointer; ignore it. */
  let ignoreClickUntil = 0;

  const active = computed(() => picked.value !== null);

  function shouldIgnoreClick(): boolean {
    return Date.now() < ignoreClickUntil;
  }

  function start(item: InventoryItemRead, source?: KeyboardEvent): void {
    picked.value = item;
    pickEvent = source ?? null;
    rotated.value = item.placement.location === 'grid' ? item.placement.rotated : false;

    if (item.placement.location === 'grid') {
      ghost.value = { x: item.placement.x, y: item.placement.y, storageId: item.placement.storageId };
      target.value = {
        location: 'grid',
        storageId: item.placement.storageId,
        x: item.placement.x,
        y: item.placement.y,
        rotated: rotated.value,
      };
      return;
    }

    const home = options.homeStorageId();
    ghost.value = home == null ? null : { x: 0, y: 0, storageId: home };
    target.value =
      home == null
        ? null
        : { location: 'grid', storageId: home, x: 0, y: 0, rotated: false };
  }

  function cancel(): void {
    picked.value = null;
    pickEvent = null;
    ghost.value = null;
    target.value = null;
    pointer.value = null;
    press = null;
  }

  function moveTo(next: GhostUpdate): void {
    if (!picked.value) return;
    ghost.value = next.storageId == null ? null : { x: next.x, y: next.y, storageId: next.storageId };
    target.value =
      next.storageId == null
        ? null
        : { location: 'grid', storageId: next.storageId, x: next.x, y: next.y, rotated: next.rotated };
    rotated.value = next.rotated;
  }

  interface GhostUpdate {
    x: number;
    y: number;
    rotated: boolean;
    storageId: number | null;
  }

  function overGrid(storageId: number, x: number, y: number): void {
    moveTo({ x, y, rotated: rotated.value, storageId });
  }

  function overEquipment(slot: EquipmentSlot): void {
    if (!picked.value) return;
    ghost.value = null;
    target.value = { location: 'equipment', slot };
  }

  function overContainer(containerItemId: number, slot: number): void {
    if (!picked.value) return;
    ghost.value = null;
    target.value = { location: 'container', containerItemId, slot };
  }

  function overModule(weaponItemId: number, slot: ModuleSlot): void {
    if (!picked.value) return;
    ghost.value = null;
    target.value = { location: 'weapon_module', weaponItemId, slot, allowUnverified: false };
  }

  function overLoose(): void {
    if (!picked.value) return;
    ghost.value = null;
    target.value = { location: 'loose' };
  }

  function clearTarget(): void {
    target.value = null;
    ghost.value = null;
  }

  function rotate(): void {
    if (!picked.value) return;
    rotated.value = !rotated.value;
    if (target.value?.location === 'grid') {
      target.value = { ...target.value, rotated: rotated.value };
    }
  }

  function moveBy(key: string): void {
    const item = picked.value;
    const current = ghost.value;
    if (!item || !current) return;
    const grid = options.storageAt(current.storageId);
    if (!grid) return;
    const next = keyboardTarget(current, key, item.size, rotated.value, grid);
    overGrid(current.storageId, next.x, next.y);
    rotated.value = next.rotated;
    if (target.value?.location === 'grid') target.value = { ...target.value, rotated: next.rotated };
  }

  function drop(): void {
    const item = picked.value;
    const destination = target.value;
    const wasRotated = rotated.value;
    if (!item || !destination || isSameTarget(item.placement, destination)) {
      cancel();
      return;
    }
    cancel();
    void options.onDrop(item.id, destination, wasRotated);
  }

  function pressItem(item: InventoryItemRead, event: PointerEvent): void {
    const touch = event.pointerType === 'touch' || event.pointerType === 'pen';
    press = { item, x: event.clientX, y: event.clientY, touch };
    if (!touch) return;

    // A second tap on the picked item cancels the pick; the click that follows opens the card.
    if (picked.value?.id === item.id) {
      press = null;
      cancel();
      return;
    }
    // Another item is being carried: leave the pick alone so the pointerup drops it here.
    if (picked.value) {
      press = null;
      return;
    }
    press = null;
    ignoringPointerUp = true;
    start(item);
  }

  function targetFromElement(element: Element | null, event: PointerEvent): DropTarget | null {
    const node = element?.closest('[data-drop]') as HTMLElement | null;
    const raw = node?.dataset.drop;
    if (!node || !raw) return null;
    const [kind, first, second] = raw.split(':');

    if (kind === 'grid' && first) {
      const storageId = Number(first);
      const grid = options.storageAt(storageId);
      if (!grid) return null;
      const cell = pointerToCell(event, node, grid.width);
      return { location: 'grid', storageId, x: cell.x, y: cell.y, rotated: rotated.value };
    }
    if (kind === 'equipment' && first && EquipmentSlotSchema.safeParse(first).success) {
      return { location: 'equipment', slot: first as EquipmentSlot };
    }
    if (kind === 'container' && first && second) {
      return { location: 'container', containerItemId: Number(first), slot: Number(second) };
    }
    if (kind === 'module' && first && second && ModuleSlotSchema.safeParse(second).success) {
      return {
        location: 'weapon_module',
        weaponItemId: Number(first),
        slot: second as ModuleSlot,
        allowUnverified: false,
      };
    }
    if (kind === 'loose') return { location: 'loose' };
    return null;
  }

  function hover(event: PointerEvent): void {
    pointer.value = { x: event.clientX, y: event.clientY };
    if (!picked.value) return;
    const next = targetFromElement(document.elementFromPoint(event.clientX, event.clientY), event);
    if (!next) {
      clearTarget();
      return;
    }
    if (next.location === 'grid') {
      overGrid(next.storageId, next.x, next.y);
      return;
    }
    if (next.location === 'equipment') {
      overEquipment(next.slot);
      return;
    }
    if (next.location === 'container') {
      overContainer(next.containerItemId, next.slot);
      return;
    }
    if (next.location === 'weapon_module') {
      overModule(next.weaponItemId, next.slot);
      return;
    }
    overLoose();
  }

  function onPointerMove(event: PointerEvent): void {
    if (press && !picked.value) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= DRAG_THRESHOLD) {
        const item = press.item;
        press = null;
        start(item);
        hover(event);
      }
      return;
    }
    if (picked.value) hover(event);
  }

  function onPointerUp(event: PointerEvent): void {
    press = null;
    if (ignoringPointerUp) {
      ignoringPointerUp = false;
      return;
    }
    if (!picked.value) return;
    hover(event);
    drop();
    ignoreClickUntil = Date.now() + 250;
  }

  function isFormField(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    const tag = element?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element?.isContentEditable === true;
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event === pickEvent) {
      pickEvent = null;
      return;
    }
    if (!picked.value || isFormField(event.target)) return;
    if (event.key === 'Escape') {
      cancel();
    } else if (event.key === 'Enter' || event.key === ' ') {
      drop();
    } else if (event.key === 'r' || event.key === 'R') {
      rotate();
    } else if (event.key.startsWith('Arrow')) {
      moveBy(event.key);
    } else {
      return;
    }
    event.preventDefault();
  }

  onMounted(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeydown);
  });

  return {
    picked,
    rotated,
    ghost,
    target,
    pointer,
    active,
    shouldIgnoreClick,
    pressItem,
    start,
    overGrid,
    overEquipment,
    overContainer,
    overModule,
    overLoose,
    clearTarget,
    rotate,
    moveBy,
    drop,
    cancel,
  };
}

export type GridDrag = ReturnType<typeof useGridDrag>;

export type { DropTarget, Point };
