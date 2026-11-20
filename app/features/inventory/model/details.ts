import type { InventoryItemRead } from '@profile/shared/contracts';

/** The kinds the item panel can render; unknown catalog kinds fall back to `other`. */
export type DetailKind = 'weapon' | 'armor' | 'artifact' | 'container' | 'attachment' | 'ammo' | 'other';

export interface DetailRow {
  key: string;
  labelKey: string;
  value: string | number;
}

interface FieldDefinition {
  key: string;
  labelKey: string;
}

const FIELDS: Record<DetailKind, readonly FieldDefinition[]> = {
  weapon: [
    { key: 'type', labelKey: 'items.fields.type' },
    { key: 'caliber', labelKey: 'items.fields.caliber' },
    { key: 'mag', labelKey: 'items.fields.mag' },
    { key: 'rof', labelKey: 'items.fields.rof' },
    { key: 'dps15', labelKey: 'items.fields.dps15' },
    { key: 'ttk15', labelKey: 'items.fields.ttk15' },
    { key: 'recoil', labelKey: 'items.fields.recoil' },
    { key: 'ergonomics', labelKey: 'items.fields.ergonomics' },
    { key: 'weight', labelKey: 'items.fields.weight' },
  ],
  armor: [
    { key: 'cls', labelKey: 'items.fields.cls' },
    { key: 'armor', labelKey: 'items.bulletProtection' },
    { key: 'armor15', labelKey: 'table.armor15' },
    { key: 'dur', labelKey: 'items.fields.dur' },
    { key: 'weight', labelKey: 'items.fields.weight' },
  ],
  artifact: [
    { key: 'type', labelKey: 'items.fields.type' },
    { key: 'effects', labelKey: 'items.fields.effects' },
    { key: 'rarityPct', labelKey: 'inventory.rarity' },
    { key: 'weight', labelKey: 'items.fields.weight' },
  ],
  container: [
    { key: 'type', labelKey: 'items.fields.type' },
    { key: 'slots', labelKey: 'items.fields.slots' },
    { key: 'eff', labelKey: 'items.fields.eff' },
    { key: 'prot', labelKey: 'items.fields.prot' },
    { key: 'shield', labelKey: 'items.fields.shield' },
    { key: 'bonus', labelKey: 'items.fields.bonus' },
    { key: 'weight', labelKey: 'items.fields.weight' },
  ],
  attachment: [
    { key: 'type', labelKey: 'items.fields.type' },
    { key: 'slot', labelKey: 'items.fields.slot' },
    { key: 'weight', labelKey: 'items.fields.weight' },
  ],
  ammo: [
    { key: 'caliber', labelKey: 'items.fields.caliber' },
    { key: 'weight', labelKey: 'items.fields.weight' },
  ],
  other: [
    { key: 'type', labelKey: 'items.fields.type' },
    { key: 'weight', labelKey: 'items.fields.weight' },
  ],
};

export function detailKind(kind: string): DetailKind {
  return kind in FIELDS ? (kind as DetailKind) : 'other';
}

function present(value: unknown): value is string | number {
  return (typeof value === 'string' && value.trim() !== '') || typeof value === 'number';
}

/**
 * The per-kind stat rows of the item panel. Values come from the live instance first,
 * then from the catalog card, then from the owned/catalog row the screen opened. A
 * missing value is omitted, never rendered as zero.
 */
export function detailRows(
  kind: string,
  options: {
    item?: InventoryItemRead | null;
    card?: Record<string, unknown> | null;
    row?: Record<string, unknown> | null;
  },
): DetailRow[] {
  const { item = null, card = null, row = null } = options;
  const instance: Record<string, unknown> = item
    ? {
        weight: item.weight,
        level: item.level,
        rarityPct: item.rarityPct,
        slot: item.slot,
        slots: item.container?.slots,
        eff: item.container?.eff,
        prot: item.container?.protection,
        shield: item.container?.shield,
        bonus: item.container?.bonus,
        type: item.container?.type,
      }
    : {};

  const aliases: Record<string, string[]> = {
    dps15: ['dps15', 'dps'],
    ttk15: ['ttk15', 'ttk'],
  };

  const read = (key: string): unknown => {
    const names = [key, ...(aliases[key] ?? [])];
    for (const source of [row, instance, card]) {
      if (!source) continue;
      for (const name of names) {
        const value = source[name];
        if (present(value)) return value;
      }
    }
    return null;
  };

  return FIELDS[detailKind(kind)].flatMap((field) => {
    const value = read(field.key);
    return present(value) ? [{ key: field.key, labelKey: field.labelKey, value }] : [];
  });
}
