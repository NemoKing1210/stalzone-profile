import type { ChatAttachment, ChatMessage, ChatThread } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';

export interface ChatThreadRow {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: number;
  thread_id: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  payload: string | null;
  created_at: string;
}

export interface ChatAttachmentRow {
  id: number;
  message_id: number;
  name: string;
  mime_type: string;
  size: number;
  data: Buffer;
  created_at: string;
}

/** A stored file with its bytes; the provider and the download route are the only readers. */
export interface ChatAttachmentData {
  id: number;
  messageId: number;
  name: string;
  mimeType: string;
  size: number;
  data: Buffer;
  createdAt: string;
}

export interface ChatAttachmentInsert {
  name: string;
  mimeType: string;
  data: Buffer;
}

function metadata(row: Omit<ChatAttachmentRow, 'data'>): ChatAttachment {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at,
  };
}

function stored(row: ChatAttachmentRow): ChatAttachmentData {
  return {
    id: row.id,
    messageId: row.message_id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    data: row.data,
    createdAt: row.created_at,
  };
}

function message(row: ChatMessageRow, attachments: ChatAttachment[] = []): ChatMessage {
  let payload: unknown = null;
  if (row.payload) {
    try {
      payload = JSON.parse(row.payload) as unknown;
    } catch {
      payload = null;
    }
  }
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    toolName: row.tool_name,
    toolCallId: row.tool_call_id,
    payload,
    attachments,
    createdAt: row.created_at,
  };
}

function thread(row: ChatThreadRow): ChatThread {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function listChatThreads(db: Db): ChatThread[] {
  return (db.prepare(`SELECT * FROM chat_thread ORDER BY updated_at DESC, id DESC`).all() as ChatThreadRow[]).map(thread);
}

export function getChatThread(db: Db, id: number): ChatThread | null {
  const row = db.prepare(`SELECT * FROM chat_thread WHERE id = ?`).get(id) as ChatThreadRow | undefined;
  return row ? thread(row) : null;
}

export function listChatMessages(db: Db, threadId: number): ChatMessage[] {
  const rows = db.prepare(`SELECT * FROM chat_message WHERE thread_id = ? ORDER BY id`).all(threadId) as ChatMessageRow[];
  const attachments = db
    .prepare(
      `SELECT a.id, a.message_id, a.name, a.mime_type, a.size, a.created_at
         FROM chat_attachment a
         JOIN chat_message m ON m.id = a.message_id
        WHERE m.thread_id = ?
        ORDER BY a.id`,
    )
    .all(threadId) as Omit<ChatAttachmentRow, 'data'>[];
  const byMessage = new Map<number, ChatAttachment[]>();
  for (const row of attachments) {
    const list = byMessage.get(row.message_id) ?? [];
    list.push(metadata(row));
    byMessage.set(row.message_id, list);
  }
  return rows.map((row) => message(row, byMessage.get(row.id) ?? []));
}

/** All files of a thread with their bytes, oldest message first; the provider builds from this. */
export function listChatAttachmentData(db: Db, threadId: number): ChatAttachmentData[] {
  return (
    db
      .prepare(
        `SELECT a.*
           FROM chat_attachment a
           JOIN chat_message m ON m.id = a.message_id
          WHERE m.thread_id = ?
          ORDER BY m.id, a.id`,
      )
      .all(threadId) as ChatAttachmentRow[]
  ).map(stored);
}

export function getChatAttachment(db: Db, id: number): ChatAttachmentData | null {
  const row = db.prepare(`SELECT * FROM chat_attachment WHERE id = ?`).get(id) as ChatAttachmentRow | undefined;
  return row ? stored(row) : null;
}

export function createChatThread(db: Db, title: string): number {
  const now = new Date().toISOString();
  const info = db
    .prepare(`INSERT INTO chat_thread (title, created_at, updated_at) VALUES (?, ?, ?)`)
    .run(title.trim().slice(0, 200) || 'New thread', now, now);
  return Number(info.lastInsertRowid);
}

export function appendChatMessage(
  db: Db,
  input: {
    threadId: number;
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolName?: string | null;
    toolCallId?: string | null;
    payload?: unknown;
    attachments?: ChatAttachmentInsert[];
  },
): number {
  const now = new Date().toISOString();
  const insertAttachment = db.prepare(
    `INSERT INTO chat_attachment (message_id, name, mime_type, size, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  return db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO chat_message (thread_id, role, content, tool_name, tool_call_id, payload, created_at)
         VALUES (@thread_id, @role, @content, @tool_name, @tool_call_id, @payload, @created_at)`,
      )
      .run({
        thread_id: input.threadId,
        role: input.role,
        content: input.content,
        tool_name: input.toolName ?? null,
        tool_call_id: input.toolCallId ?? null,
        payload: input.payload === undefined ? null : JSON.stringify(input.payload),
        created_at: now,
      });
    const messageId = Number(info.lastInsertRowid);
    for (const file of input.attachments ?? []) {
      const name = file.name.trim().replace(/[\\/]+/g, '-').slice(0, 200) || 'file';
      insertAttachment.run(messageId, name, file.mimeType, file.data.length, file.data, now);
    }
    db.prepare(`UPDATE chat_thread SET updated_at = ? WHERE id = ?`).run(now, input.threadId);
    return messageId;
  })();
}

export function deleteChatThread(db: Db, id: number): void {
  db.prepare(`DELETE FROM chat_thread WHERE id = ?`).run(id);
}
