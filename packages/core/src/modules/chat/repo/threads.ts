import type { ChatMessage, ChatThread } from '@profile/shared/contracts';
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

function message(row: ChatMessageRow): ChatMessage {
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
  return (
    db.prepare(`SELECT * FROM chat_message WHERE thread_id = ? ORDER BY id`).all(threadId) as ChatMessageRow[]
  ).map(message);
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
  },
): number {
  const now = new Date().toISOString();
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
  db.prepare(`UPDATE chat_thread SET updated_at = ? WHERE id = ?`).run(now, input.threadId);
  return Number(info.lastInsertRowid);
}

export function deleteChatThread(db: Db, id: number): void {
  db.prepare(`DELETE FROM chat_thread WHERE id = ?`).run(id);
}
