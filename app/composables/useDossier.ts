export interface DossierFreshness {
  dataUpdated: string | null;
  pricesUpdatedAt: string | null;
  pricesAgeMin: number | null;
  sources: { id: string; status: string; lastOkAt: string | null; lastTryAt: string | null; lastError: string | null }[];
}

export interface DossierMetaResponse {
  meta: Record<string, unknown>;
  catalogMeta: Record<string, unknown>;
  freshness: DossierFreshness;
}

export interface DossierCharacter {
  nick?: string;
  realm?: string;
  faction?: string | null;
  alliance?: string | null;
  clan?: string | null;
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
  playstyle?: string | null;
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

export interface BuildPayload {
  id: string;
  title: string;
  short: string | null;
  tag: string | null;
  goal: string | null;
  container: string | null;
  slots: number | null;
  eff: number | null;
  budget: number | null;
  total: number | null;
  metrics: { l: string; v: string; s?: string | null }[];
  rows: {
    name: string;
    q: string | null;
    price: number | null;
    lots: number | null;
    eff: string | null;
    bonus: string | null;
    minus: string | null;
    why: string | null;
    rank: string | null;
  }[];
  verdict: string | null;
}

export interface DossierPayload {
  meta: Record<string, unknown>;
  character: DossierCharacter;
  career: unknown[];
  weapons: WeaponPayload[];
  armor: ArmorPayload[];
  containers: ContainerPayload[];
  artifacts: ArtifactPayload[];
  notes: { title?: string; slug?: string | null; position?: number; [key: string]: unknown }[];
  catalog: { weapons: CatalogEntry[]; armor: CatalogEntry[]; meta: Record<string, unknown> };
  recommendations: {
    id?: string;
    title?: string;
    lead?: string;
    slug?: string | null;
    position?: number;
    [key: string]: unknown;
  }[];
  details: Record<string, unknown>;
  earnings: { updated?: string; note?: string; rows?: Record<string, unknown>[]; [key: string]: unknown } | null;
  builds: {
    updated: string | null;
    priceNote: string | null;
    items: BuildPayload[];
    avoid: { name: string; why: string }[];
    current: { title?: string; note?: string; rows?: { name: string; lvl: number }[] } | null;
  };
  icons: Record<string, string>;
  freshness: DossierFreshness;
}

/** Shared dossier requests; payload and meta stay in Nuxt's fetch cache across pages. */
export function useDossier() {
  const { data: payload, refresh: refreshPayload } = useFetch<DossierPayload>('/api/v1/payload', {
    key: 'dossier-payload',
  });
  const { data: meta, refresh: refreshMeta } = useFetch<DossierMetaResponse>('/api/v1/meta', {
    key: 'dossier-meta',
  });

  async function refresh(): Promise<void> {
    await Promise.all([refreshPayload(), refreshMeta()]);
  }

  return { payload, meta, refresh };
}
