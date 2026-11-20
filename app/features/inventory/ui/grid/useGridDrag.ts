import type { EquipmentSlot, InventoryItemRead, ModuleSlot, StorageRead } from '@profile/shared/contracts';
import { acceptsEquipment, EquipmentSlotSchema, ModuleSlotSchema } from '@profile/shared/contracts';

import {
  cellPixels,
  centerGrab,
  grabPoint,
  gridUnder,
  isPrimaryButton,
  pickRotation,
  isSameTarget,
  keyboardTarget,
  previewBox,
  sourceOf,
  startPlacement,
  type DropTarget,
  type GridBox,
  type Point,
  type PreviewBox,
} from '../../model/drag';
import { scrollVelocity } from '../../model/autoscroll';
import { filteredDropBlocked } from '../../model/containerFilters';
import { clampOrigin, effectiveSize, ghostForGrid, type GridBounds, type Size } from '../../model/grid';

type InteractApi = (typeof import('interactjs'))['default'];

/** Pixels a press must travel before it becomes a drag; below this it stays a click. */
const DRAG_THRESHOLD = 6;

/** A `data-drop` id is a positive integer; anything else is a malformed attribute. */
function positiveId(value: string | undefined): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

let interactApi: InteractApi | null = null;
let interactLoading: Promise<InteractApi | null> | null = null;

/** interact.js touches the DOM at import time, so the client loads it on first use. */
function loadInteract(): Promise<InteractApi | null> {
  if (!import.meta.client) return Promise.resolve(null);
  interactLoading ??= import('interactjs')
    .then((module) => {
      interactApi = module.default;
      return interactApi;
    })
    .catch((error: unknown) => {
      // A missing drag library must be visible in the diagnostic log, not a dead screen.
      console.error('inventory: failed to load interactjs', error);
      return null;
    });
  return interactLoading;
}

export interface GridDragOptions {
  onDrop: (itemId: number, target: DropTarget, rotated: boolean) => void | Promise<void>;
  /** The storage behind an id, used for grid dimensions and for validating a landing. */
  storageFor: (storageId: number) => StorageRead | null;
  /** The landing is blocked locally; the caller explains why. */
  onDropRejected?: (reason: 'invalid' | 'filtered') => void;
  /** Storages with a view-only filter active; a same-storage drop cannot land among hidden cells. */
  filteredStorageIds: () => Set<number>;
  /** Grid a non-grid item lands on when picked up with the keyboard. */
  homeStorageId: () => number | null;
  /** The read-only intake grid: it never hosts a pick, it only releases items. */
  intakeStorageId: () => number | null;
}

export interface DragGhost {
  x: number;
  y: number;
  storageId: number;
}

interface TileRecord {
  item: InventoryItemRead | null;
  rect: GridBounds | null;
}

/**
 * One drag state for the whole inventory screen. Pointer drags are handled by
 * interact.js, which moves the real tile under the cursor at its true footprint;
 * the keyboard ghost feeds the same state, so drops land through one code path.
 */
export function useGridDrag(options: GridDragOptions) {
  const picked = ref<InventoryItemRead | null>(null);
  const rotated = ref(false);
  const ghost = ref<DragGhost | null>(null);
  const target = ref<DropTarget | null>(null);
  /** The floating tile under the pointer at the item's real footprint. */
  const preview = ref<PreviewBox | null>(null);
  /** The cell of the item's footprint under the pointer; the drop keeps it under the pointer. */
  const grab = ref<Point>({ x: 0, y: 0 });

  /** The keydown that picked an item; the same event must not immediately drop it. */
  let pickEvent: KeyboardEvent | null = null;
  /** A completed pointer drag ends with a click on whatever is under the pointer; ignore it. */
  let ignoreClickUntil = 0;

  const active = computed(() => picked.value !== null);

  /** Tiles bound to interact.js, with the item they currently represent. */
  const tiles = new Map<HTMLElement, TileRecord>();
  /** The tile being dragged, the press point inside it and the current pointer. */
  let dragging: { el: HTMLElement; pointer: Point } | null = null;
  /** Pixels per cell for the preview, taken from the last grid the pointer crossed. */
  let cellPx: Size | null = null;
  /** Edge auto-scroll: frame handle and the last pointer position it follows. */
  let scrollRaf = 0;
  let lastPointer: Point | null = null;

  function shouldIgnoreClick(): boolean {
    return Date.now() < ignoreClickUntil;
  }

  function start(item: InventoryItemRead, source?: KeyboardEvent, at?: Point): void {
    picked.value = item;
    pickEvent = source ?? null;
    preview.value = null;
    cellPx = null;
    const spot = startPlacement(item.placement, {
      homeStorageId: options.homeStorageId(),
      intakeStorageId: options.intakeStorageId(),
    });
    ghost.value = spot.ghost;
    target.value = spot.target;
    rotated.value = spot.rotated;
    const size = effectiveSize(item.size, rotated.value);
    grab.value = at ?? centerGrab(size);
  }

  function stopScroll(): void {
    if (scrollRaf !== 0) cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
    lastPointer = null;
  }

  /**
   * Scrolls the page while the pointer rests near the viewport edge. The grid moves under
   * a stationary pointer, so the target is recomputed after every scroll frame.
   */
  function scrollTick(): void {
    scrollRaf = 0;
    if (!picked.value || !lastPointer) return;
    const velocity = scrollVelocity(lastPointer, { width: window.innerWidth, height: window.innerHeight });
    if (velocity.x !== 0 || velocity.y !== 0) {
      window.scrollBy(velocity.x, velocity.y);
      hoverAt(lastPointer);
      movePreview(lastPointer);
    }
    scrollRaf = requestAnimationFrame(scrollTick);
  }

  function startScroll(pointer: Point): void {
    if (!import.meta.client) return;
    lastPointer = pointer;
    if (scrollRaf === 0) scrollRaf = requestAnimationFrame(scrollTick);
  }

  function cancel(): void {
    picked.value = null;
    pickEvent = null;
    ghost.value = null;
    target.value = null;
    preview.value = null;
    cellPx = null;
    // End the pointer gesture with the pick: otherwise the next mouse move passes the
    // threshold again and silently starts a second drag of the item just cancelled.
    dragging = null;
    stopScroll();
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

  function clearTarget(): void {
    target.value = null;
    ghost.value = null;
  }

  function rotate(): void {
    if (!picked.value) return;
    rotated.value = !rotated.value;
    const size = effectiveSize(picked.value.size, rotated.value);
    grab.value = { x: Math.min(grab.value.x, size.width - 1), y: Math.min(grab.value.y, size.height - 1) };
    if (target.value?.location === 'grid') {
      target.value = { ...target.value, rotated: rotated.value };
    }
    // The carried card turns with the ghost, not on the next pointer move.
    if (lastPointer) movePreview(lastPointer);
  }

  function moveBy(key: string): void {
    const item = picked.value;
    const current = ghost.value;
    if (!item || !current) return;
    const storage = options.storageFor(current.storageId);
    if (!storage) return;
    const grid = { width: storage.width, height: storage.height };
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
    if (filteredDropBlocked(item, destination, options.filteredStorageIds())) {
      cancel();
      options.onDropRejected?.('filtered');
      return;
    }
    if (destination.location === 'grid') {
      const storage = options.storageFor(destination.storageId);
      const items = storage
        ? storage.items.flatMap((entry) =>
            entry.placement.location === 'grid'
              ? [{ id: entry.id, size: entry.size, placement: entry.placement }]
              : [],
          )
        : [];
      const landing = storage
        ? ghostForGrid(
            { width: storage.width, height: storage.height },
            item,
            destination,
            wasRotated,
            items,
          )
        : null;
      // A red ghost is a local refusal: sending it would only turn a clear visual into
      // a server error toast after a round trip.
      if (!landing?.valid) {
        cancel();
        options.onDropRejected?.('invalid');
        return;
      }
    }
    cancel();
    void options.onDrop(item.id, destination, wasRotated);
  }

  /** The non-grid drop zones, which are small and still resolved by the element on top. */
  function targetFromElement(element: Element | null): Exclude<DropTarget, { location: 'grid' }> | null {
    const node = element?.closest('[data-drop]') as HTMLElement | null;
    const raw = node?.dataset.drop;
    if (!node || !raw) return null;
    const [kind, first, second] = raw.split(':');

    if (kind === 'equipment' && first && EquipmentSlotSchema.safeParse(first).success) {
      return { location: 'equipment', slot: first as EquipmentSlot };
    }
    const id = positiveId(first);
    if (kind === 'container' && id != null && second) {
      const slot = Number(second);
      if (Number.isInteger(slot) && slot >= 0) return { location: 'container', containerItemId: id, slot };
    }
    if (kind === 'module' && id != null && second && ModuleSlotSchema.safeParse(second).success) {
      return {
        location: 'weapon_module',
        weaponItemId: id,
        slot: second as ModuleSlot,
        allowUnverified: false,
      };
    }
    return null;
  }

  /** Every visible grid box, so a target comes from the pointer's position, not the top element. */
  function gridBoxes(): { box: GridBox; node: HTMLElement }[] {
    const boxes: { box: GridBox; node: HTMLElement }[] = [];
    for (const node of document.querySelectorAll<HTMLElement>('[data-drop^="grid:"]')) {
      const storageId = Number(node.dataset.drop?.slice('grid:'.length));
      const storage = options.storageFor(storageId);
      if (!Number.isFinite(storageId) || !storage) continue;
      const rect = node.getBoundingClientRect();
      boxes.push({
        node,
        box: {
          storageId,
          columns: storage.width,
          rows: storage.height,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      });
    }
    return boxes;
  }

  function hoverAt(pointer: Point): void {
    if (!picked.value) return;
    const top = document.elementFromPoint(pointer.x, pointer.y);
    // A pane or a dialog above a grid still blocks the drop; tiles inside it do not.
    const live = gridBoxes().filter(({ node }) => !top || node.contains(top));
    const hit = gridUnder(
      pointer,
      live.map(({ box }) => box),
    );
    if (hit) {
      const storage = options.storageFor(hit.storageId);
      const node = live.find(({ box }) => box.storageId === hit.storageId)?.node;
      if (!storage || !node) {
        clearTarget();
        return;
      }
      const grid = { width: storage.width, height: storage.height };
      cellPx = cellPixels({ width: node.clientWidth, height: node.clientHeight }, grid);
      const size = effectiveSize(picked.value.size, rotated.value);
      const origin = clampOrigin({ x: hit.x - grab.value.x, y: hit.y - grab.value.y }, size, grid);
      overGrid(hit.storageId, origin.x, origin.y);
      return;
    }
    const next = targetFromElement(top);
    if (!next) {
      clearTarget();
      return;
    }
    if (next.location === 'equipment') {
      // A slot only lights up for an item it can take; the drop never asks the server
      // for a pair the table already rejects.
      if (!picked.value || !acceptsEquipment(next.slot, picked.value)) {
        clearTarget();
        return;
      }
      overEquipment(next.slot);
      return;
    }
    if (next.location === 'container') {
      overContainer(next.containerItemId, next.slot);
      return;
    }
    overModule(next.weaponItemId, next.slot);
  }

  /** The preview follows the pointer at the footprint's size; the ghost shows the snap. */
  function movePreview(pointer: Point): void {
    const item = picked.value;
    if (!item || !cellPx) return;
    preview.value = previewBox(pointer, grab.value, cellPx, effectiveSize(item.size, rotated.value));
  }

  /* ------------------------------------------------------------------ */
  /* Pointer drags (interact.js)                                         */
  /* ------------------------------------------------------------------ */

  /** A grid tile carries its own cell size; an equipment slot borrows the home grid's. */
  function sourceCell(el: HTMLElement, rect: GridBounds, size: Size): Size | null {
    if (el.dataset.size) return { width: rect.width / size.width, height: rect.height / size.height };
    const home = options.homeStorageId();
    if (home == null) return null;
    const node = document.querySelector<HTMLElement>(`[data-drop="grid:${home}"]`);
    const storage = options.storageFor(home);
    if (!node || !storage) return null;
    return cellPixels(
      { width: node.clientWidth, height: node.clientHeight },
      { width: storage.width, height: storage.height },
    );
  }

  /** Starts the shared drag state once the press has travelled past the threshold. */
  function beginDrag(el: HTMLElement, record: TileRecord, pointer: Point): void {
    const item = record.item;
    if (!item) return;
    const rect = record.rect ?? el.getBoundingClientRect();
    // The grab must use the rotation the pick actually starts with: an intake item is
    // stored rotated but starts unrotated, and a rotated grab would offset the card.
    const rotatedAtStart = pickRotation(item.placement, options.intakeStorageId());
    const size = effectiveSize(item.size, rotatedAtStart);
    const at = grabPoint(sourceOf(item.placement, options.intakeStorageId()), rect, pointer, size);
    start(item, undefined, at);
    // An item picked up outside a grid has no cell to preview: hover decides the target.
    if (item.placement.location !== 'grid') {
      ghost.value = null;
      target.value = null;
    }
    cellPx = sourceCell(el, rect, size);
    movePreview(pointer);
    hoverAt(pointer);
    startScroll(pointer);
  }

  /** Releases one tile; an empty equipment slot and an unmounted tile both land here. */
  function detachTile(el: HTMLElement): void {
    if (!tiles.delete(el)) return;
    if (interactApi) interactApi(el).unset();
    if (dragging?.el !== el) return;
    // The tile left the payload mid-drag: end the drag, or the auto-scroll loop keeps
    // running with a pointer that no longer belongs to an item.
    dragging = null;
    if (picked.value) cancel();
  }

  /** Registers a tile element as a drag source; call it from a template ref. A null item detaches. */
  function attachTile(el: HTMLElement | null, item: InventoryItemRead | null): void {
    if (!el) return;
    if (!item) {
      detachTile(el);
      return;
    }
    const bound = tiles.get(el);
    if (bound) {
      bound.item = item;
      return;
    }
    // The rectangle is measured on press, not here: measuring every tile on mount and on
    // every payload refresh forces a layout for the whole grid.
    tiles.set(el, { item, rect: null });
    void loadInteract().then((interact) => {
      if (!interact || !tiles.has(el)) return;
      const interactable = interact(el).styleCursor(false);
      interactable.draggable({
        // The interaction starts on press; the threshold below decides whether it is a
        // drag. Waiting for a move *over the tile* loses fast pointer movements.
        manualStart: true,
        inertia: false,
        listeners: {
          move: (event) => {
            if (!dragging) return;
            const pointer = { x: event.clientX, y: event.clientY };
            lastPointer = pointer;
            if (!picked.value) {
              const dx = pointer.x - dragging.pointer.x;
              const dy = pointer.y - dragging.pointer.y;
              if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
              const record = tiles.get(el);
              if (!record?.item) return;
              beginDrag(el, record, dragging.pointer);
            }
            hoverAt(pointer);
            movePreview(pointer);
          },
          end: (event) => {
            stopScroll();
            if (picked.value) {
              hoverAt({ x: event.clientX, y: event.clientY });
              dragging = null;
              ignoreClickUntil = Date.now() + 250;
              drop();
              return;
            }
            dragging = null;
          },
        },
      });
      interactable.on('down', (event) => {
        // A right press opens the context menu; only the primary button picks a card up.
        if (!isPrimaryButton(event.button)) return;
        const record = tiles.get(el);
        if (!record?.item || picked.value) return;
        record.rect = el.getBoundingClientRect();
        dragging = { el, pointer: { x: event.clientX, y: event.clientY } };
        event.interaction.start({ name: 'drag' }, event.interactable, el);
      });
    });
  }

  /** Releases every interact.js binding; call on section unmount. */
  function detachTiles(): void {
    if (interactApi) for (const el of tiles.keys()) interactApi(el).unset();
    tiles.clear();
    dragging = null;
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
    window.addEventListener('keydown', onKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown);
    detachTiles();
    stopScroll();
  });

  return {
    picked,
    rotated,
    ghost,
    target,
    preview,
    active,
    shouldIgnoreClick,
    start,
    attachTile,
    overGrid,
    overEquipment,
    overContainer,
    overModule,
    clearTarget,
    rotate,
    moveBy,
    drop,
    cancel,
  };
}

export type GridDrag = ReturnType<typeof useGridDrag>;

export type { DropTarget, Point };
