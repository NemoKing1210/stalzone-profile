import type { ChatAttachment, ChatMessage, ChatMessageMeta } from '@profile/shared/contracts';

import { cleanAssistantText } from './text';

export type ChatToolStatus = 'ok' | 'declined';

export interface ChatToolRunView {
  id: string;
  name: string;
  status: ChatToolStatus;
  payload: unknown;
}

export type ChatRow =
  | {
      kind: 'user';
      id: string;
      text: string;
      attachments: ChatAttachment[];
      /** Set when the turn failed; the bubble marks it as not delivered and offers Retry. */
      error: string | null;
      createdAt: string;
    }
  | {
      kind: 'assistant';
      id: string;
      text: string;
      reasoning: string | null;
      meta: ChatMessageMeta | null;
      createdAt: string;
    }
  | { kind: 'tools'; id: string; runs: ChatToolRunView[] };

export interface ChatToolRunCount {
  name: string;
  count: number;
}

/** Header badges: one entry per distinct action, in first-seen order. */
export function toolRunCounts(runs: readonly ChatToolRunView[]): ChatToolRunCount[] {
  const counts = new Map<string, number>();
  for (const run of runs) counts.set(run.name, (counts.get(run.name) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count }));
}

/**
 * One rendered row per stored message, with consecutive tool calls folded into a single
 * block. Order follows the message ids, so a tool group always sits between the assistant
 * round that requested it and the answer that follows.
 */
export function chatRows(messages: readonly ChatMessage[]): ChatRow[] {
  const rows: ChatRow[] = [];
  for (const message of messages) {
    if (message.role === 'tool') {
      const payload = message.payload;
      const isDeclined =
        typeof payload === 'object' && payload !== null && 'declined' in payload && payload.declined === true;
      const run: ChatToolRunView = {
        id: String(message.id),
        name: message.toolName ?? 'tool',
        status: isDeclined ? 'declined' : 'ok',
        payload: message.payload,
      };
      const last = rows.at(-1);
      if (last?.kind === 'tools') last.runs.push(run);
      else rows.push({ kind: 'tools', id: run.id, runs: [run] });
      continue;
    }
    if (message.role === 'user') {
      rows.push({
        kind: 'user',
        id: String(message.id),
        text: message.content,
        attachments: message.attachments,
        error: message.error,
        createdAt: message.createdAt,
      });
      continue;
    }
    rows.push({
      kind: 'assistant',
      id: String(message.id),
      text: cleanAssistantText(message.content),
      reasoning: message.reasoning,
      meta: message.meta,
      createdAt: message.createdAt,
    });
  }
  return rows;
}
