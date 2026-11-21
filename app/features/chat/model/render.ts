import { buildChatChart, type ChatChartData } from './chart';

type Json = Record<string, unknown>;

export interface ChatItemView {
  name: string;
  rank: string | null;
  kind: string | null;
  category: string | null;
  icon: string | null;
  /** The owned instance behind the card; null for a catalog row. */
  instanceId: number | null;
  level: number | null;
  qty: number | null;
  virtual: boolean;
  /** Where the instance sits, or the storage name the tool reported. */
  location: string | null;
}

export interface ChatPriceView {
  name: string;
  price: number | null;
  lots: number | null;
  quality: string | null;
  updated: string | null;
}

export type ChatToolView =
  | { kind: 'items'; items: ChatItemView[]; chart?: ChatChartData }
  | { kind: 'prices'; prices: ChatPriceView[] }
  | { kind: 'text'; text: string }
  | { kind: 'json'; json: string };

/** The page that owns each kind; a card opens that page at its instance or catalog row. */
const KIND_PATHS: Record<string, string> = {
  weapon: '/weapons',
  armor: '/armor',
  container: '/containers',
  artifact: '/artifacts',
  modification: '/modifications',
};

/**
 * Where a chat card leads: the owned instance opens its own modal on the kind page, a catalog
 * row opens the catalog tab filtered to that name. An unknown or stackable kind has no page.
 */
export function chatItemLink(item: ChatItemView): string | null {
  const path = item.kind ? KIND_PATHS[item.kind] : undefined;
  if (!path) return null;
  if (item.instanceId != null) return `${path}?item=${item.instanceId}`;
  return `${path}?mode=catalog&name=${encodeURIComponent(item.name)}`;
}

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((entry): entry is Json => !!entry && typeof entry === 'object') : [];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** `instance` marks rows whose `id` is an owned instance, not a catalog item. */
function itemView(row: Json, location: string | null = null, instance = false): ChatItemView {
  return {
    name: String(row.name ?? row.displayName ?? '—'),
    rank: str(row.rank),
    kind: str(row.kind),
    category: str(row.category),
    icon: str(row.icon),
    instanceId: instance ? num(row.id) : null,
    level: num(row.level),
    qty: num(row.qty),
    virtual: row.virtual === true,
    location,
  };
}

/** Catalog rows carry `metrics`; two or more comparable items become a chart. */
function chartFor(rows: readonly Json[], body: Json): ChatChartData | undefined {
  const entries = rows.map((row) => ({
    item: itemView(row),
    metrics: row.metrics && typeof row.metrics === 'object' ? (row.metrics as Json) : {},
  }));
  return buildChatChart(entries, num(body.level), num(body.hp)) ?? undefined;
}

/** Placement as the tool reports it: a slot name for equipment, the location otherwise. */
function placementLocation(row: Json): string | null {
  const placement = row.placement as Json | undefined;
  if (!placement || typeof placement !== 'object') return str(row.location);
  if (placement.location === 'equipment') return str(placement.slot);
  return str(placement.location) ?? str(row.location);
}

/**
 * Maps a tool result to the site's own renderers. Unknown tools fall back to a readable
 * JSON block, never to a fabricated table; a payload without items is a text answer.
 */
export function chatToolView(toolName: string, payload: unknown): ChatToolView {
  if (!payload || typeof payload !== 'object') {
    return { kind: 'text', text: payload == null ? '—' : String(payload) };
  }
  const body = payload as Json;

  if (toolName === 'get_prices') {
    const rows = asArray(body.prices ?? body);
    return {
      kind: 'prices',
      prices: rows.map((row) => ({
        name: String(row.name ?? '—'),
        price: num(row.price ?? row.lotPrice ?? row.currentPrice ?? row.lastTrade),
        lots: num(row.lots ?? row.lotCount),
        quality: str(row.quality),
        updated: str(row.updated ?? row.fetchedAt ?? row.lotUpdatedAt),
      })),
    };
  }

  if (toolName === 'get_inventory' || toolName === 'list_inventory_items' || toolName === 'list_storages') {
    const items: ChatItemView[] = [];
    for (const storage of asArray(body.storages)) {
      const location = str(storage.name) ?? str(storage.kind);
      for (const item of asArray(storage.items)) items.push(itemView(item, location, true));
    }
    for (const item of asArray(body.equipment ? Object.values(body.equipment as Json) : [])) {
      items.push(itemView(item, 'equipment', true));
    }
    for (const item of asArray(body.loose)) items.push(itemView(item, 'loose', true));
    for (const item of asArray(body.items)) items.push(itemView(item, placementLocation(item), true));
    return { kind: 'items', items };
  }

  if (toolName === 'get_item') {
    const item = body.item;
    const rows = item && typeof item === 'object' ? [item as Json] : asArray(body.items);
    return { kind: 'items', items: rows.map((row) => itemView(row)) };
  }

  if (toolName === 'find_items' || toolName === 'compare_items') {
    const rows = asArray(body.items ?? (Array.isArray(body) ? body : [body]));
    return { kind: 'items', items: rows.map((row) => itemView(row)), chart: chartFor(rows, body) };
  }

  if (toolName === 'get_character') {
    const character = body.character as Json | undefined;
    const source = character ?? body;
    return {
      kind: 'text',
      text: [source.nick, source.faction, source.region].filter(Boolean).join(' — ') || '—',
    };
  }

  return { kind: 'json', json: JSON.stringify(payload, null, 2) };
}
