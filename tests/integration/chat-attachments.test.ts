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
  it('stores verified bytes beside the message and returns metadata without them', () => {
    const threadId = createChatThread(db, 'Files');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const messageId = appendChatMessage(db, {
      threadId,
      role: 'user',
      content: 'Look at these',
      attachments: [
        { name: 'notes.md', mimeType: 'text/markdown', data: Buffer.from('# Notes') },
        { name: '..\\shot.png', mimeType: 'image/png', data: png },
      ],
    });

    const [message] = listChatMessages(db, threadId);
    expect(message!.id).toBe(messageId);
    expect(message!.attachments).toEqual([
      expect.objectContaining({ name: 'notes.md', mimeType: 'text/plain; charset=utf-8', size: 7 }),
      expect.objectContaining({ name: 'shot.png', mimeType: 'image/png', size: 8 }),
    ]);
    expect(message!.attachments[0]).not.toHaveProperty('data');

    const stored = listChatAttachmentData(db, threadId);
    expect(stored.map((file) => [file.messageId, file.name, file.data.toString('hex')])).toEqual([
      [messageId, 'notes.md', Buffer.from('# Notes').toString('hex')],
      [messageId, 'shot.png', png.toString('hex')],
    ]);

    const image = stored.find((file) => file.name === 'shot.png')!;
    expect(image.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(getChatAttachment(db, image.id)?.data).toEqual(png);
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

  it('refuses a binary disguised as text and stores nothing', () => {
    const threadId = createChatThread(db, 'Files');
    expect(() =>
      appendChatMessage(db, {
        threadId,
        role: 'user',
        content: 'Broken',
        attachments: [{ name: 'note.txt', mimeType: 'text/plain', data: Buffer.from([0xff, 0xfe]) }],
      }),
    ).toThrow(/not a supported file/);
    expect(listChatMessages(db, threadId)).toEqual([]);
  });

  it('never reuses an attachment id after a delete', () => {
    const firstThread = createChatThread(db, 'First');
    appendChatMessage(db, {
      threadId: firstThread,
      role: 'user',
      content: 'One',
      attachments: [{ name: 'one.txt', mimeType: 'text/plain', data: Buffer.from('one') }],
    });
    const first = listChatAttachmentData(db, firstThread)[0]!;
    deleteChatThread(db, firstThread);

    const secondThread = createChatThread(db, 'Second');
    appendChatMessage(db, {
      threadId: secondThread,
      role: 'user',
      content: 'Two',
      attachments: [{ name: 'two.txt', mimeType: 'text/plain', data: Buffer.from('two') }],
    });
    const second = listChatAttachmentData(db, secondThread)[0]!;
    expect(second.id).toBeGreaterThan(first.id);
  });

  it('serves nothing for an id that no longer exists', () => {
    expect(getChatAttachment(db, 999)).toBeNull();
  });
});
