/** These are the API contract's shapes, not a second copy. */
import type { EventRead, Faction, Freshness, OwnedKind } from '@dossier/shared/contracts';

export type { OwnedKind };

/** Manual override of a container's display values; a null field falls back to the item data. */
export interface ContainerOverride {
  containerType: string | null;
  shield: number | null;
  bonus: string | null;
  protection: number | null;
  slots: number | null;
  eff: number | null;
}

export interface OwnedEditTarget {
  ownedId: number;
  name: string;
  kind: OwnedKind;
  level: number;
  qty: number;
  quality: string | null;
  skin: string | null;
  note: string | null;
  role: string | null;
  slot: string | null;
  /** Present only for container rows; ignored by the editor for other kinds. */
  container?: ContainerOverride | null;
}

/** The subset ContainerFillEditor needs; a full ContainerPayload satisfies it. */
export interface FillTarget {
  ownedId: number;
  name: string;
  artifacts: { name: string; lvl: number }[];
  artifactsAsOf: string | null;
}

/** `/api/v1/events` returns contract event reads; entity ids are nullable by contract. */
export type EventRow = EventRead;

/* ------------------------------ dossier payload ------------------------------ */

export interface DossierCharacter {
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
  stash?: string | null;
  stats?: Record<string, number | string>;
}

export interface WeaponPayload {
  name: string;
  ownedId?: number;
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

export interface DossierPayload {
  meta: Record<string, unknown>;
  character: DossierCharacter;
  weapons: WeaponPayload[];
  armor: ArmorPayload[];
  containers: ContainerPayload[];
  artifacts: ArtifactPayload[];
  catalog: { weapons: CatalogEntry[]; armor: CatalogEntry[]; meta: Record<string, unknown> };
  details: Record<string, unknown>;
  icons: Record<string, string>;
  freshness: Freshness;
}
