import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendChatMessage,
  chatItemContext,
  closeDb,
  createChatThread,
  createInventoryItem,
  deleteInventoryItem,
  ensureDefaultSources,
  extractChatRefs,
  findItemByKindName,
  listChatMessages,
  mentionRefsFromText,
  migrate,
  openDb,
  readChatPins,
  replaceChatPins,
  resolveChatRefs,
  WriteError,
  type Db,
} from '@profile/core';
import { upsertCharacter } from '@profile/core/testing';
import type { InventoryKind } from '@profile/shared/contracts';
import { seedCatalog } from '../fixtures/seed';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-chat-pins-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
  seedCatalog(db);
  upsertCharacter(db, { nick: 'Tester', region: 'ru' });
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

function item(name: string, kind: string) {
  const row = findItemByKindName(db, kind, name);
  if (!row) throw new Error(`fixture item missing: ${name}`);
  return row;
}

function instance(name: string, kind: InventoryKind, level = 10, quality?: string): number {
  const created = createInventoryItem(db, {
    name,
    kind,
    level,
    qty: 1,
    virtual: false,
    ...(kind === 'artifact' && quality ? { quality } : {}),
    dryRun: false,
  });
  const after = created.diff.after;
  if (!after || typeof after !== 'object' || !('id' in after) || typeof after.id !== 'number') {
    throw new Error('createInventoryItem did not return an id');
  }
  return after.id;
}

function errorCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof WriteError) return error.code;
    throw error;
  }
  throw new Error('expected a WriteError');
}

describe('chat pins', () => {
  it('replaces, orders and reads the shelf', () => {
    const ak = item('АК-12', 'weapon');
    const ks = item('KS-1', 'weapon');
    const pins = replaceChatPins(db, [
      { kind: 'weapon', itemId: ak.id },
      { kind: 'weapon', itemId: ks.id },
    ]);
    expect(pins.map((pin) => [pin.name, pin.token])).toEqual([
      ['АК-12', '@weapon:ак-12'],
      ['KS-1', '@weapon:ks-1'],
    ]);
    expect(readChatPins(db).map((pin) => pin.sortOrder)).toEqual([0, 1]);
    expect(replaceChatPins(db, [{ kind: 'weapon', itemId: ak.id }, { kind: 'weapon', itemId: ak.id }])).toHaveLength(
      1,
    );
  });

  it('refuses more than eight targets and unsupported kinds', () => {
    const ak = item('АК-12', 'weapon');
    const ks = item('KS-1', 'weapon');
    const armor = item('Куница', 'armor');
    const container = item('Рюкзак', 'container');
    const artifact = item('Нервяк', 'artifact');
    const targets = [
      { kind: 'weapon' as const, itemId: ak.id },
      { kind: 'weapon' as const, itemId: ks.id },
      { kind: 'armor' as const, itemId: armor.id },
      { kind: 'container' as const, itemId: container.id },
      { kind: 'artifact' as const, itemId: artifact.id },
      { kind: 'weapon' as const, itemId: ak.id, instanceId: instance('АК-12', 'weapon') },
      { kind: 'weapon' as const, itemId: ks.id, instanceId: instance('KS-1', 'weapon') },
      { kind: 'armor' as const, itemId: armor.id, instanceId: instance('Куница', 'armor') },
      { kind: 'container' as const, itemId: container.id, instanceId: instance('Рюкзак', 'container') },
    ];
    expect(errorCode(() => replaceChatPins(db, targets))).toBe('PIN_LIMIT');
    const motif = item('Камуфляж', 'motif');
    expect(errorCode(() => replaceChatPins(db, [{ kind: 'weapon', itemId: motif.id }]))).toBe(
      'PIN_TARGET_INVALID',
    );
  });

  it('pins an owned instance and drops it when the instance is deleted', () => {
    const ak = item('АК-12', 'weapon');
    const id = instance('АК-12', 'weapon', 12);
    const [pin] = replaceChatPins(db, [{ kind: 'weapon', itemId: ak.id, instanceId: id }]);
    expect(pin).toMatchObject({
      name: 'АК-12',
      level: 12,
      quality: null,
      instanceId: id,
      token: `@weapon:ак-12#${id}`,
    });
    const context = chatItemContext(db, readChatPins(db), []);
    expect(context).toContain(`instance ${id}`);
    expect(context).toContain('in storage');
    deleteInventoryItem(db, id, { dryRun: false });
    expect(readChatPins(db)).toEqual([]);
  });

  it('resolves explicit refs, drops edited-out tokens and rejects unknown ids', () => {
    const ak = item('АК-12', 'weapon');
    const input = { token: '@weapon:ак-12', kind: 'weapon' as const, itemId: ak.id };
    const [ref] = resolveChatRefs(db, [input], 'сравни @weapon:ак-12 и всё');
    expect(ref).toMatchObject({ name: 'АК-12', instanceId: null, level: null });
    expect(resolveChatRefs(db, [input], 'сравни и всё')).toEqual([]);
    expect(
      errorCode(() =>
        resolveChatRefs(db, [{ token: '@weapon:нет', kind: 'weapon', itemId: 999_999 }], 'смотри @weapon:нет'),
      ),
    ).toBe('CHAT_REF_NOT_FOUND');
  });

  it('resolves a hand-typed token only when it is exact', () => {
    const ak = item('АК-12', 'weapon');
    expect(mentionRefsFromText(db, '@weapon:ак-12', new Set())[0]).toMatchObject({ itemId: ak.id });
    expect(mentionRefsFromText(db, '@weapon:ак', new Set())).toEqual([]);
  });

  it('builds a pinned context with every pin and no other inventory item', () => {
    const ak = item('АК-12', 'weapon');
    const ks = item('KS-1', 'weapon');
    instance('KS-1', 'weapon');
    const pins = replaceChatPins(db, [{ kind: 'weapon', itemId: ak.id }]);
    const context = chatItemContext(db, pins, []);
    expect(context).toContain('## Pinned items');
    expect(context).toContain('@weapon:ак-12');
    expect(context).toContain(`catalog ${ak.id}`);
    expect(context).not.toContain('@weapon:ks-1');
    expect(context).not.toContain(ks.name);

    const refs = resolveChatRefs(db, [{ token: '@weapon:ак-12', kind: 'weapon', itemId: ak.id }], '@weapon:ак-12');
    const deduped = chatItemContext(db, pins, refs);
    expect(deduped.match(/@weapon:ак-12\b/g)).toHaveLength(1);
    expect(deduped).not.toContain('## Referenced items');
  });

  it('stores refs with a user message and extracts known tokens from an answer', () => {
    const ak = item('АК-12', 'weapon');
    const refs = resolveChatRefs(db, [{ token: '@weapon:ак-12', kind: 'weapon', itemId: ak.id }], '@weapon:ак-12');
    const threadId = createChatThread(db, 'compare');
    appendChatMessage(db, { threadId, role: 'user', content: 'сравни @weapon:ак-12', refs });
    const stored = listChatMessages(db, threadId)[0]!;
    expect(stored.refs).toEqual(refs);

    expect(extractChatRefs('Смотри @weapon:ак-12', refs)).toEqual(refs);
    expect(extractChatRefs('Смотри @weapon:ак-12', [])).toEqual([]);
    expect(extractChatRefs('Смотри @weapon:другое', refs)).toEqual([]);
  });
});
