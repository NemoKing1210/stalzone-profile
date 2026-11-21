import {
  ChatItemKindSchema,
  chatItemToken,
  normalizeChatItemName,
  parseChatItemTokens,
  type ChatItemKind,
  type ChatSendRef,
  type InventoryRead,
  type ItemSummary,
} from '@profile/shared/contracts';

import { allInventoryItems } from '~/shared/lib/inventory';
import type { ChatItemView } from './render';

/** Only kinds with an item page are offered; every chip must have somewhere to go. */
const LINKABLE = new Set<string>(ChatItemKindSchema.options);

function linkableKind(kind: string): kind is ChatItemKind {
  return LINKABLE.has(kind);
}

export interface ChatItemCandidate {
  token: string;
  kind: ChatItemKind;
  itemId: number;
  instanceId: number | null;
  name: string;
  rank: string | null;
  icon: string | null;
  level: number | null;
  quality: string | null;
  virtual: boolean;
  source: 'pinned' | 'owned' | 'catalog';
}

export interface MentionRange {
  start: number;
  end: number;
  /** The raw text after `@`, including a `kind:` prefix when present. */
  query: string;
  kind: ChatItemKind | null;
}

/** The owned instances the owner can pin or mention, one entry per instance. */
export function inventoryCandidates(
  inventory: InventoryRead | null | undefined,
  used?: ReadonlySet<string>,
): ChatItemCandidate[] {
  const candidates: ChatItemCandidate[] = [];
  for (const item of allInventoryItems(inventory)) {
    if (!linkableKind(item.kind)) continue;
    const name = item.displayName ?? item.name;
    candidates.push({
      token: chatItemToken(
        { kind: item.kind, name, itemId: item.itemId, instanceId: item.id },
        used,
      ),
      kind: item.kind,
      itemId: item.itemId,
      instanceId: item.id,
      name,
      rank: item.rank,
      icon: item.icon,
      level: item.level,
      quality: item.quality,
      virtual: item.virtual,
      source: 'owned',
    });
  }
  return candidates;
}

export function catalogCandidate(
  row: ItemSummary,
  used?: ReadonlySet<string>,
): ChatItemCandidate | null {
  if (!linkableKind(row.kind)) return null;
  return {
    token: chatItemToken({ kind: row.kind, name: row.name, itemId: row.id }, used),
    kind: row.kind,
    itemId: row.id,
    instanceId: null,
    name: row.name,
    rank: row.rank,
    icon: row.icon,
    level: null,
    quality: null,
    virtual: false,
    source: 'catalog',
  };
}

/** A card from a tool result can be pinned; ammo and other unsupported kinds cannot. */
export function candidateFromToolItem(
  item: ChatItemView,
  used?: ReadonlySet<string>,
): ChatItemCandidate | null {
  if (item.itemId == null || !item.kind || !linkableKind(item.kind)) return null;
  return {
    token: chatItemToken(
      { kind: item.kind, name: item.name, itemId: item.itemId, instanceId: item.instanceId },
      used,
    ),
    kind: item.kind,
    itemId: item.itemId,
    instanceId: item.instanceId,
    name: item.name,
    rank: item.rank,
    icon: item.icon,
    level: item.level,
    quality: null,
    virtual: item.virtual,
    source: item.instanceId == null ? 'catalog' : 'owned',
  };
}

/**
 * The active mention at the caret. A complete token followed by whitespace closes the menu;
 * an `@` inside a word (an email) never opens it.
 */
export function mentionQueryAt(text: string, caret: number): MentionRange | null {
  const end = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, end);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && /[\p{L}\p{N}_]/u.test(before[at - 1]!)) return null;
  const raw = before.slice(at + 1);
  if (/\s/u.test(raw)) return null;
  const colon = raw.indexOf(':');
  const prefix = colon > 0 ? raw.slice(0, colon) : '';
  const kind: ChatItemKind | null = linkableKind(prefix) ? prefix : null;
  return { start: at, end, query: raw, kind };
}

/** Replace the active query; keep exactly one space before existing text. */
export function replaceMention(
  text: string,
  range: Pick<MentionRange, 'start' | 'end'>,
  token: string,
): { text: string; caret: number } {
  const tail = text.slice(range.end);
  const inserted = /^\s/u.test(tail) ? token : `${token} `;
  return {
    text: `${text.slice(0, range.start)}${inserted}${tail}`,
    caret: range.start + inserted.length,
  };
}

/** A token edited out of the draft must not carry a reference into the turn. */
export function pruneMentionRefs(text: string, refs: readonly ChatSendRef[]): ChatSendRef[] {
  const present = new Set(parseChatItemTokens(text).map((match) => match.token));
  return refs.filter((ref) => present.has(ref.token));
}

/** Pinned first, then exact/prefix/substring, owned before catalog on a tie. */
export function rankCandidates(
  query: string,
  candidates: readonly ChatItemCandidate[],
): ChatItemCandidate[] {
  const trimmed = query.trim();
  const colon = trimmed.indexOf(':');
  const term = colon > 0 && linkableKind(trimmed.slice(0, colon)) ? trimmed.slice(colon + 1) : trimmed;
  const norm = normalizeChatItemName(term);
  const ranked: { candidate: ChatItemCandidate; pinned: number; match: number; origin: number }[] = [];
  for (const candidate of candidates) {
    const name = normalizeChatItemName(candidate.name);
    let match = 0;
    if (norm) {
      if (name === norm) match = 0;
      else if (name.startsWith(norm)) match = 1;
      else if (name.includes(norm)) match = 2;
      else continue;
    }
    ranked.push({
      candidate,
      pinned: candidate.source === 'pinned' ? 0 : 1,
      match,
      origin: candidate.source === 'catalog' ? 1 : 0,
    });
  }
  ranked.sort(
    (a, b) =>
      a.pinned - b.pinned ||
      a.match - b.match ||
      a.origin - b.origin ||
      a.candidate.name.length - b.candidate.name.length ||
      a.candidate.name.localeCompare(b.candidate.name, 'ru'),
  );
  return ranked.map((entry) => entry.candidate);
}
