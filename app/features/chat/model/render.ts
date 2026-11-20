type Json = Record<string, unknown>;

export interface ChatItemView {
  name: string;
  rank: string | null;
  kind: string | null;
  category: string | null;
  icon: string | null;
}

export interface ChatPriceView {
  name: string;
  price: number | null;
  lots: number | null;
  quality: string | null;
  updated: string | null;
}

export interface ChatInventoryView {
  name: string;
  level: number;
  qty: number;
  location: string;
}

export type ChatToolView =
  | { kind: 'items'; items: ChatItemView[] }
  | { kind: 'prices'; prices: ChatPriceView[] }
  | { kind: 'inventory'; rows: ChatInventoryView[] }
  | { kind: 'text'; text: string }
  | { kind: 'json'; json: string };

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((entry): entry is Json => !!entry && typeof entry === 'object') : [];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function itemView(row: Json): ChatItemView {
  return {
    name: String(row.name ?? row.displayName ?? '—'),
    rank: str(row.rank),
    kind: str(row.kind),
    category: str(row.category),
    icon: str(row.icon),
  };
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
    const roots = asArray(body.storages);
    const rows: ChatInventoryView[] = [];
    for (const storage of roots) {
      for (const item of asArray(storage.items)) {
        rows.push({
          name: String(item.name ?? item.displayName ?? '—'),
          level: num(item.level) ?? 0,
          qty: num(item.qty) ?? 1,
          location: String(storage.name ?? storage.kind ?? 'grid'),
        });
      }
    }
    for (const item of asArray(body.equipment ? Object.values(body.equipment as Json) : [])) {
      rows.push({
        name: String(item.name ?? '—'),
        level: num(item.level) ?? 0,
        qty: num(item.qty) ?? 1,
        location: 'equipment',
      });
    }
    for (const item of asArray(body.loose)) {
      rows.push({
        name: String(item.name ?? '—'),
        level: num(item.level) ?? 0,
        qty: num(item.qty) ?? 1,
        location: 'loose',
      });
    }
    for (const item of asArray(body.items)) {
      const placement = item.placement as Json | undefined;
      rows.push({
        name: String(item.name ?? item.displayName ?? '—'),
        level: num(item.level) ?? 0,
        qty: num(item.qty) ?? 1,
        location: String(placement?.location ?? item.location ?? '—'),
      });
    }
    return { kind: 'inventory', rows };
  }

  if (toolName === 'find_items' || toolName === 'get_item' || toolName === 'compare_items') {
    const rows = asArray(body.items ?? (Array.isArray(body) ? body : [body]));
    return { kind: 'items', items: rows.map(itemView) };
  }

  if (toolName === 'get_character') {
    const character = body.character as Json | undefined;
    const source = character ?? body;
    return {
      kind: 'text',
      text: [source.nick, source.faction, source.region].filter(Boolean).join(' · ') || '—',
    };
  }

  return { kind: 'json', json: JSON.stringify(payload, null, 2) };
}
