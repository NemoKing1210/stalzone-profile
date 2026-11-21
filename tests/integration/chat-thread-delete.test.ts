import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendChatMessage,
  closeDb,
  createChatThread,
  deleteChatThreadWrite,
  listChatMessages,
  listChatThreads,
  listEvents,
  migrate,
  openDb,
  rollbackEvent,
  WriteError,
  type Db,
} from '@profile/core';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-chat-delete-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

function seedThread(): number {
  const threadId = createChatThread(db, 'Private planning');
  appendChatMessage(db, {
    threadId,
    role: 'user',
    content: 'private message body',
    attachments: [
      {
        name: 'notes.txt',
        mimeType: 'text/plain',
        data: Buffer.from('secret attachment body'),
      },
    ],
  });
  appendChatMessage(db, { threadId, role: 'assistant', content: 'private answer' });
  return threadId;
}

describe('chat thread deletion', () => {
  it('reports counts on a dry run and deletes nothing', () => {
    const threadId = seedThread();
    const result = deleteChatThreadWrite(db, threadId, true);

    expect(result.dryRun).toBe(true);
    expect(result.diff.before).toEqual({ id: threadId, messages: 2, attachments: 1 });
    expect(result.diff.after).toBeNull();
    expect(listChatThreads(db)).toHaveLength(1);
    expect(listChatMessages(db, threadId)).toHaveLength(2);
    expect(listEvents(db)).toHaveLength(0);
  });

  it('deletes the thread with its messages and files and writes one audited event', () => {
    const threadId = seedThread();
    const result = deleteChatThreadWrite(db, threadId, false);

    expect(result.dryRun).toBe(false);
    expect(result.eventId).toBeTypeOf('number');
    expect(listChatThreads(db)).toEqual([]);
    expect(listChatMessages(db, threadId)).toEqual([]);
    const attachments = db.prepare(`SELECT COUNT(*) AS c FROM chat_attachment`).get() as { c: number };
    expect(attachments.c).toBe(0);

    const [event] = listEvents(db);
    expect(event).toMatchObject({ action: 'chat.thread.delete', entity: 'chat', entity_id: String(threadId), after: null });
    expect(JSON.parse(event!.before!)).toEqual({ id: threadId, messages: 2, attachments: 1 });
    const journal = `${event!.before}${event!.after}${event!.note}`;
    expect(journal).not.toContain('private message body');
    expect(journal).not.toContain('secret attachment body');
    expect(journal).not.toContain('Private planning');
  });

  it('answers 404 for a thread that does not exist', () => {
    expect(() => deleteChatThreadWrite(db, 999, false)).toThrow(WriteError);
    try {
      deleteChatThreadWrite(db, 999, false);
    } catch (error) {
      expect((error as WriteError).code).toBe('THREAD_NOT_FOUND');
    }
    expect(listEvents(db)).toHaveLength(0);
  });

  it('records the deletion as not rollbackable', () => {
    const threadId = seedThread();
    const result = deleteChatThreadWrite(db, threadId, false);

    expect(() => rollbackEvent(db, result.eventId!, false)).toThrow(/cannot be rolled back/);
    try {
      rollbackEvent(db, result.eventId!, false);
    } catch (error) {
      expect((error as WriteError).code).toBe('EVENT_NOT_ROLLBACKABLE');
    }
  });
});
