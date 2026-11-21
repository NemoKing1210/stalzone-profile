import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendChatMessage,
  closeDb,
  createChatThread,
  deleteChatThread,
  getChatAttachment,
  listChatAttachmentData,
  listChatMessages,
  migrate,
  openDb,
  type Db,
} from '@profile/core';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-chat-files-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('chat attachments storage', () => {
  it('stores bytes beside the message and returns metadata without them', () => {
    const threadId = createChatThread(db, 'Files');
    const messageId = appendChatMessage(db, {
      threadId,
      role: 'user',
      content: 'Look at these',
      attachments: [
        { name: 'notes.md', mimeType: 'text/markdown', data: Buffer.from('# Notes') },
        { name: 'shot.png', mimeType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      ],
    });

    const [message] = listChatMessages(db, threadId);
    expect(message!.id).toBe(messageId);
    expect(message!.attachments).toEqual([
      expect.objectContaining({ name: 'notes.md', mimeType: 'text/markdown', size: 7 }),
      expect.objectContaining({ name: 'shot.png', mimeType: 'image/png', size: 4 }),
    ]);
    expect(message!.attachments[0]).not.toHaveProperty('data');

    const stored = listChatAttachmentData(db, threadId);
    expect(stored.map((file) => [file.messageId, file.name, file.data.toString('hex')])).toEqual([
      [messageId, 'notes.md', Buffer.from('# Notes').toString('hex')],
      [messageId, 'shot.png', '89504e47'],
    ]);

    const image = stored.find((file) => file.name === 'shot.png')!;
    expect(getChatAttachment(db, image.id)?.data).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('deletes attachments with their thread', () => {
    const threadId = createChatThread(db, 'Files');
    appendChatMessage(db, {
      threadId,
      role: 'user',
      content: 'Bye',
      attachments: [{ name: 'note.txt', mimeType: 'text/plain', data: Buffer.from('x') }],
    });

    deleteChatThread(db, threadId);

    const count = db.prepare(`SELECT COUNT(*) AS c FROM chat_attachment`).get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('serves nothing for an id that no longer exists', () => {
    expect(getChatAttachment(db, 999)).toBeNull();
  });
});
