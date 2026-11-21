import {
  CHAT_PIN_LIMIT,
  ChatItemKindSchema,
  chatItemToken,
  normalizeChatItemName,
  parseChatItemTokens,
  type ChatItemKind,
  type ChatItemRef,
  type ChatPin,
  type ChatPinTarget,
  type ChatSendRef,
  type InventoryItemRead,
} from '@profile/shared/contracts';

import type { Db } from '../../../platform/db/index.js';
import { WriteError } from '../../../platform/journal/index.js';
import {
  getIcon,
  getItemById,
  itemStats,
  metricRow,
  searchItems,
  type ItemRow,
} from '../../catalog/index.js';
import { inventoryItemRead } from '../../inventory/index.js';
import { listChatPinRows, replaceChatPinRows } from '../repo/pins.js';

/** Only kinds with a page the interface can open are pinnable or mentionable. */
const LINKABLE = new Set<string>(ChatItemKindSchema.options);

function linkable(kind: string): kind is ChatItemKind {
  return LINKABLE.has(kind);
}

interface ResolvedItem {
  kind: ChatItemKind;
  itemId: number;
  instanceId: number | null;
  item: ItemRow;
  instance: InventoryItemRead | null;
  name: string;
  rank: string | null;
  icon: string | null;
  level: number | null;
  quality: string | null;
  virtual: boolean;
}

function resolveItem(
  db: Db,
  target: ChatPinTarget,
  code: 'PIN_TARGET_INVALID' | 'CHAT_REF_NOT_FOUND',
): ResolvedItem {
  const item = getItemById(db, target.itemId);
  if (!item || !linkable(item.kind)) {
    throw new WriteError(422, code, 'Item not found or its kind cannot be referenced');
  }
  if (target.kind !== item.kind) {
    throw new WriteError(422, code, 'Item kind does not match');
  }
  const catalogIcon = getIcon(db, item.id)?.path ?? null;
  if (target.instanceId == null) {
    return {
      kind: item.kind,
      itemId: item.id,
      instanceId: null,
      item,
      instance: null,
      name: item.name,
      rank: item.rank,
      icon: catalogIcon,
      level: null,
      quality: null,
      virtual: false,
    };
  }
  const instance = inventoryItemRead(db, target.instanceId);
  if (!instance || instance.itemId !== item.id) {
    throw new WriteError(422, code, 'Inventory instance not found');
  }
  return {
    kind: item.kind,
    itemId: item.id,
    instanceId: instance.id,
    item,
    instance,
    name: instance.displayName ?? instance.name,
    rank: instance.rank ?? item.rank,
    icon: instance.icon ?? catalogIcon,
    level: instance.level,
    quality: instance.quality,
    virtual: instance.virtual,
  };
}

function identity(kind: string, itemId: number, instanceId: number | null): string {
  return `${kind}:${itemId}:${instanceId ?? 'catalog'}`;
}

function refOf(item: ResolvedItem, token: string): ChatItemRef {
  return {
    token,
    kind: item.kind,
    itemId: item.itemId,
    instanceId: item.instanceId,
    name: item.name,
    rank: item.rank,
    icon: item.icon,
    level: item.level,
    quality: item.quality,
    virtual: item.virtual,
  };
}

/** One entry per identity, first wins; pins and explicit refs can name the same item. */
export function dedupeChatRefs(refs: readonly ChatItemRef[]): ChatItemRef[] {
  const seen = new Set<string>();
  const out: ChatItemRef[] = [];
  for (const ref of refs) {
    const key = identity(ref.kind, ref.itemId, ref.instanceId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function targetOf(item: ResolvedItem): ChatPinTarget {
  return {
    kind: item.kind,
    itemId: item.itemId,
    ...(item.instanceId == null ? {} : { instanceId: item.instanceId }),
  };
}

/** Reads the shelf; a row whose item disappeared (a crash mid-cascade) is skipped. */
export function readChatPins(db: Db): ChatPin[] {
  const used = new Set<string>();
  const pins: ChatPin[] = [];
  for (const row of listChatPinRows(db)) {
    try {
      const item = getItemById(db, row.item_id);
      if (!item || !linkable(item.kind)) continue;
      const resolved = resolveItem(
        db,
        {
          kind: item.kind,
          itemId: row.item_id,
          ...(row.instance_id == null ? {} : { instanceId: row.instance_id }),
        },
        'PIN_TARGET_INVALID',
      );
      const token = chatItemToken(
        {
          kind: resolved.kind,
          name: resolved.name,
          itemId: resolved.itemId,
          instanceId: resolved.instanceId,
        },
        used,
      );
      used.add(token);
      pins.push({ ...refOf(resolved, token), sortOrder: row.sort_order, createdAt: row.created_at });
    } catch {
      continue;
    }
  }
  return pins;
}

export function replaceChatPins(db: Db, targets: readonly ChatPinTarget[]): ChatPin[] {
  const seen = new Set<string>();
  const unique: ChatPinTarget[] = [];
  for (const target of targets) {
    const key = identity(target.kind, target.itemId, target.instanceId ?? null);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(target);
  }
  if (unique.length > CHAT_PIN_LIMIT) {
    throw new WriteError(422, 'PIN_LIMIT', `At most ${CHAT_PIN_LIMIT} items can be pinned`);
  }
  const resolved = unique.map((target) => resolveItem(db, target, 'PIN_TARGET_INVALID'));
  replaceChatPinRows(db, resolved.map(targetOf));
  return readChatPins(db);
}

/** Explicit refs are authoritative: a missing target is a 422, not a silent drop. */
export function resolveChatRefs(db: Db, refs: readonly ChatSendRef[], text: string): ChatItemRef[] {
  const present = new Set(parseChatItemTokens(text).map((match) => match.token));
  const seen = new Set<string>();
  const out: ChatItemRef[] = [];
  for (const ref of refs) {
    if (!present.has(ref.token)) continue;
    const key = identity(ref.kind, ref.itemId, ref.instanceId ?? null);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(refOf(resolveItem(db, ref, 'CHAT_REF_NOT_FOUND'), ref.token));
  }
  return out;
}

/**
 * Tokens typed by hand resolve only when exactly one item matches; a suffix `#N` is an
 * instance and `~N` a catalog id, never a guess.
 */
export function mentionRefsFromText(
  db: Db,
  text: string,
  known: ReadonlySet<string>,
): ChatItemRef[] {
  const seen = new Set<string>();
  const out: ChatItemRef[] = [];
  for (const match of parseChatItemTokens(text)) {
    if (known.has(match.token) || !linkable(match.kind)) continue;
    try {
      let resolved: ResolvedItem | null = null;
      if (match.instanceId != null) {
        const instance = inventoryItemRead(db, match.instanceId);
        if (!instance || instance.kind !== match.kind) continue;
        if (normalizeChatItemName(instance.displayName ?? instance.name) !== match.slug) continue;
        resolved = resolveItem(
          db,
          { kind: match.kind, itemId: instance.itemId, instanceId: instance.id },
          'CHAT_REF_NOT_FOUND',
        );
      } else if (match.itemId != null) {
        const row = getItemById(db, match.itemId);
        if (!row || row.kind !== match.kind || normalizeChatItemName(row.name) !== match.slug) continue;
        resolved = resolveItem(db, { kind: match.kind, itemId: row.id }, 'CHAT_REF_NOT_FOUND');
      } else {
        const rows = searchItems(db, {
          q: match.slug.replaceAll('-', ' '),
          kind: match.kind,
          limit: 20,
        });
        const exact = rows.filter((row) => normalizeChatItemName(row.name) === match.slug);
        if (exact.length !== 1) continue;
        resolved = resolveItem(db, { kind: match.kind, itemId: exact[0]!.id }, 'CHAT_REF_NOT_FOUND');
      }
      const key = identity(resolved.kind, resolved.itemId, resolved.instanceId);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(refOf(resolved, match.token));
    } catch {
      continue;
    }
  }
  return out;
}

function factLine(db: Db, ref: ChatItemRef): string {
  const item = getItemById(db, ref.itemId);
  if (!item) return '';
  const name = ref.name.length > 120 ? `${ref.name.slice(0, 119)}…` : ref.name;
  const level = ref.instanceId == null ? 15 : (ref.level ?? 0);
  const metrics = Object.entries(metricRow({ item, rows: itemStats(db, item.id), level, hp: 600 }))
    .filter(([, value]) => value != null)
    .map(([key, value]) => (typeof value === 'number' ? `${key} ${Math.round(value * 10) / 10}` : `${key} ${value}`))
    .join(', ');
  if (ref.instanceId == null) {
    return `- ${ref.token} — ${name} (${ref.kind}, catalog, level ${level}); ${metrics || 'no data'}; catalog ${ref.itemId}`;
  }
  const instance = inventoryItemRead(db, ref.instanceId);
  const mods = (instance?.modifications ?? [])
    .slice(0, 5)
    .map((mod) => mod.displayName ?? mod.name)
    .join(', ');
  const quality = ref.quality == null ? '' : `, quality ${ref.quality}`;
  const virtual = ref.virtual ? ', virtual' : '';
  return `- ${ref.token} — ${name} (${ref.kind}, level ${level}${quality}${virtual}); ${metrics || 'no data'}; catalog ${ref.itemId}, instance ${ref.instanceId}${mods ? `; modifications: ${mods}` : ''}`;
}

const CONTEXT_LIMIT = 8_000;

/**
 * The turn's owner-selected context. Every pin is always present; the safety cap can only
 * drop trailing referenced items, never a pin, and it never truncates a line.
 */
export function chatItemContext(db: Db, pins: readonly ChatPin[], refs: readonly ChatItemRef[]): string {
  const pinned = new Set(pins.map((pin) => identity(pin.kind, pin.itemId, pin.instanceId)));
  const pinLines = pins.map((pin) => factLine(db, pin)).filter(Boolean);
  const refLines = refs
    .filter((ref) => !pinned.has(identity(ref.kind, ref.itemId, ref.instanceId)))
    .map((ref) => factLine(db, ref))
    .filter(Boolean);
  const sections: string[] = [];
  if (pinLines.length) sections.push(['## Pinned items', ...pinLines].join('\n'));
  if (refLines.length) {
    const budget = CONTEXT_LIMIT - sections.join('\n\n').length;
    const kept: string[] = [];
    let used = 0;
    for (const line of refLines) {
      if (used + line.length + 1 > budget - 40) break;
      kept.push(line);
      used += line.length + 1;
    }
    if (kept.length) sections.push(['## Referenced items', ...kept].join('\n'));
    if (kept.length < refLines.length) sections.push('… (further references omitted)');
  }
  return sections.length ? `\n\n${sections.join('\n\n')}` : '';
}

/** Assistant tokens become refs only when the turn already knows the exact token. */
export function extractChatRefs(text: string, known: readonly ChatItemRef[]): ChatItemRef[] {
  const byToken = new Map<string, ChatItemRef>();
  for (const ref of known) if (!byToken.has(ref.token)) byToken.set(ref.token, ref);
  const seen = new Set<string>();
  const out: ChatItemRef[] = [];
  for (const match of parseChatItemTokens(text)) {
    const ref = byToken.get(match.token);
    if (!ref) continue;
    const key = identity(ref.kind, ref.itemId, ref.instanceId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}
