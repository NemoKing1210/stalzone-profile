export type OwnedKind = 'weapon' | 'armor' | 'artifact' | 'container';

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
