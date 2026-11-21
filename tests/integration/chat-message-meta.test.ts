import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendChatMessage,
  closeDb,
  createChatThread,
  ensureDefaultSources,
  listChatMessages,
  migrate,
  openDb,
  type Db,
} from '@profile/core';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-chat-meta-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('chat message metadata', () => {
  it('round-trips reasoning and provider meta', () => {
    const threadId = createChatThread(db, 'meta');
    appendChatMessage(db, {
      threadId,
      role: 'assistant',
      content: 'answer',
      reasoning: 'weigh the options',
      meta: { model: 'test-model', durationMs: 1234, usage: { total_tokens: 42 } },
    });

    const [stored] = listChatMessages(db, threadId);
    expect(stored).toMatchObject({
      reasoning: 'weigh the options',
      meta: { model: 'test-model', durationMs: 1234, usage: { total_tokens: 42 } },
    });
  });

  it('keeps absent reasoning and meta as null, not empty values', () => {
    const threadId = createChatThread(db, 'plain');
    appendChatMessage(db, { threadId, role: 'assistant', content: 'answer' });

    const [stored] = listChatMessages(db, threadId);
    expect(stored?.reasoning).toBeNull();
    expect(stored?.meta).toBeNull();
  });
});
