import type { InventoryItemRead } from '@profile/shared/contracts';

/** The per-kind inputs the add/edit modals may show; everything else is read from the catalog. */
export interface ItemFormFields {
  level: boolean;
  qty: boolean;
  rarity: boolean;
  skin: boolean;
}

/** The game's own matrix: weapons and armor level and take skins, artifacts carry the one
 * rarity roll, stacks carry a quantity, containers and modifications carry neither. The DB
 * still forces qty=1 and level 0 outside their kinds; hiding the input keeps the form honest.
 */
export function itemFormFields(kind: string): ItemFormFields {
  if (kind === 'weapon' || kind === 'armor') return { level: true, qty: false, rarity: false, skin: true };
  if (kind === 'artifact') return { level: false, qty: false, rarity: true, skin: false };
  if (kind === 'ammo' || kind === 'other') return { level: false, qty: true, rarity: false, skin: false };
  return { level: false, qty: false, rarity: false, skin: false };
}

export interface ItemFormValues {
  level: number;
  qty: number;
  rarityPct: number | null;
  skin: string | null | undefined;
  virtual: boolean;
}

/** Motifs the picker may offer: only those whose base catalog item is the chosen one. */
export function skinsFor(
  motifs: readonly { name: string; baseItemId?: number | null }[],
  itemId: number | null | undefined,
): string[] {
  if (itemId == null) return [];
  return motifs.filter((motif) => motif.baseItemId === itemId).map((motif) => motif.name);
}

/** Create body for one kind: only the visible fields, no free-text role/note/slot. */
export function itemCreatePayload(
  kind: string,
  item: { id?: number; name: string; slot?: string | null },
  values: ItemFormValues,
): Record<string, unknown> {
  const fields = itemFormFields(kind);
  return {
    name: item.name,
    kind,
    virtual: values.virtual,
    ...(item.id != null ? { catalogItemId: item.id } : {}),
    dryRun: false,
    ...(fields.level ? { level: Math.max(0, Math.min(15, Math.trunc(values.level))) } : {}),
    ...(fields.qty ? { qty: Math.max(1, Math.min(99, Math.trunc(values.qty))) } : {}),
    ...(fields.rarity ? { rarityPct: values.rarityPct } : {}),
    ...(fields.skin ? { skin: values.skin ?? null } : {}),
  };
}

/** Patch body for one kind: only allowed fields that actually changed, or null for no-op. */
export function itemPatchPayload(
  kind: string,
  target: Pick<InventoryItemRead, 'level' | 'qty' | 'rarityPct'> & { skinName: string | null },
  values: ItemFormValues,
): Record<string, unknown> | null {
  const fields = itemFormFields(kind);
  const patch: Record<string, unknown> = {};
  if (fields.level && Math.trunc(values.level) !== target.level) patch.level = Math.trunc(values.level);
  if (fields.qty && Math.trunc(values.qty) !== target.qty) patch.qty = Math.trunc(values.qty);
  if (fields.rarity && values.rarityPct !== target.rarityPct) patch.rarityPct = values.rarityPct;
  if (fields.skin && (values.skin ?? null) !== target.skinName) patch.skin = values.skin ?? null;
  return Object.keys(patch).length ? { ...patch, dryRun: false } : null;
}
