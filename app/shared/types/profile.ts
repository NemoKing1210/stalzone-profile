/** These are the API contract's shapes, not a second copy. */
import type {
  EventRead,
  Faction,
  Freshness,
  InventoryItemRead,
  InventoryRead,
  OwnedKind,
  RarityTier,
} from '@profile/shared/contracts';

export type { OwnedKind };

/** Manual override of a container's display values; a null field falls back to the item data. */
export interface ContainerOverride {
  type: string | null;
  shield: number | null;
  bonus: string | null;
  protection: number | null;
  slots: number | null;
  eff: number | null;
}

/** One inventory instance as the edit modal needs it. */
export interface InstanceEditTarget {
  instanceId: number;
  /** Catalog item id, the key of the layout override endpoint. */
  itemId: number;
  name: string;
  kind: OwnedKind;
  level: number;
  qty: number;
  quality: string | null;
  skin: string | null;
  note: string | null;
  role: string | null;
  slot: string | null;
  rarityPct: number | null;
  rarityTier: RarityTier | null;
  /** Present only for containers; ignored by the editor for other kinds. */
  container?: ContainerOverride | null;
}

/** The instance whose artifact fill the editor replaces. */
export interface ContainerFillTarget {
  container: InventoryItemRead;
}

/** `/api/v1/events` returns contract event reads; entity ids are nullable by contract. */
export type EventRow = EventRead;

/* ------------------------------ profile payload ------------------------------ */

export interface ProfileCharacter {
  nick?: string;
  region?: string;
  faction?: Faction | null;
  alliance?: string | null;
  clanName?: string | null;
  clanRank?: string | null;
  arrived?: string | null;
  hours?: number | null;
  kd?: number | null;
  accuracy?: number | null;
  headshot?: number | null;
  achievements?: number | null;
  achievementPoints?: number | null;
  money?: number | null;
  maxMoney?: number | null;
  stats?: Record<string, number | string>;
}

export interface WeaponPayload {
  name: string;
  ownedId?: number;
  instanceId?: number;
  storageId?: number | null;
  placement?: { location: string; [key: string]: unknown };
  qty?: number;
  note?: string | null;
  quality?: string | null;
  skin?: string | null;
  lvl: number;
  dmg: number | null;
  rof: number | null;
  dps: number | null;
  ttk: number | null;
  dmg15: number | null;
  dps15: number | null;
  ttk15: number | null;
  mag: number | null;
  caliber: string | null;
  type: string | null;
  rank: string | null;
  slot: string | null;
  role: string | null;
  weight: number | null;
  icon: string | null;
  [key: string]: unknown;
}

export interface ArmorPayload {
  name: string;
  ownedId?: number;
  instanceId?: number;
  storageId?: number | null;
  placement?: { location: string; [key: string]: unknown };
  qty?: number;
  note?: string | null;
  quality?: string | null;
  skin?: string | null;
  lvl: number;
  cls: string | null;
  armor: number | null;
  armor15: number | null;
  rank: string | null;
  weight: number | null;
  icon: string | null;
  prot?: Record<string, number | null>;
  [key: string]: unknown;
}

export interface ArtifactPayload {
  name: string;
  ownedId?: number;
  instanceId?: number;
  storageId?: number | null;
  placement?: { location: string; [key: string]: unknown };
  qty?: number;
  note?: string | null;
  quality?: string | null;
  skin?: string | null;
  type: string | null;
  q: string | null;
  lvl: number;
  effects: string | null;
  rank: string | null;
  icon: string | null;
  [key: string]: unknown;
}

export interface ContainerPayload {
  name: string;
  ownedId?: number;
  instanceId?: number;
  storageId?: number | null;
  placement?: { location: string; [key: string]: unknown };
  qty?: number;
  note?: string | null;
  quality?: string | null;
  skin?: string | null;
  type: string | null;
  weight: number | null;
  slots: number | null;
  eff: number | null;
  prot: number | null;
  shield: number | null;
  bonus: string | null;
  rank: string | null;
  artifacts: { name: string; lvl: number }[];
  artifactsAsOf: string | null;
  icon: string | null;
  [key: string]: unknown;
}

export interface CatalogEntry {
  name: string;
  rank?: string | null;
  type?: string | null;
  cls?: string | null;
  icon?: string | null;
  slot?: string | null;
  caliber?: string | null;
  mag?: number | null;
  weight?: number | null;
  dmg15?: number | null;
  rof?: number | null;
  dps15?: number | null;
  ttk15?: number | null;
  armor15?: number | null;
  [key: string]: unknown;
}

export interface ProfilePayload {
  meta: Record<string, unknown>;
  character: ProfileCharacter;
  weapons: WeaponPayload[];
  armor: ArmorPayload[];
  containers: ContainerPayload[];
  artifacts: ArtifactPayload[];
  catalog: { weapons: CatalogEntry[]; armor: CatalogEntry[]; meta: Record<string, unknown> };
  /** The instance inventory: storages, equipment, loose tray and computed loadout. */
  inventory: InventoryRead;
  details: Record<string, unknown>;
  icons: Record<string, string>;
  freshness: Freshness;
}
