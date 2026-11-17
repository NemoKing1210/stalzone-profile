export type OwnedKind = 'weapon' | 'armor' | 'artifact' | 'container';

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

export interface EventRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  note: string | null;
}
