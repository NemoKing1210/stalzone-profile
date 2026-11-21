import type { ChatAttachment, ChatMessage } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import { chatRows } from '~/features/chat/model/rows';

function message(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role' | 'content'>): ChatMessage {
  return {
    threadId: 1,
    toolName: null,
    toolCallId: null,
    payload: null,
    attachments: [],
    createdAt: '2026-11-21T10:00:00.000Z',
    ...overrides,
  };
}

const user = (id: number, content = 'hi', attachments: ChatAttachment[] = []) =>
  message({ id, role: 'user', content, attachments });
const assistant = (id: number, content: string) => message({ id, role: 'assistant', content });
const tool = (id: number, toolName: string, payload: unknown = {}) =>
  message({ id, role: 'tool', content: '{}', toolName, toolCallId: `call-${id}`, payload });

describe('chat rows', () => {
  it('groups consecutive tool messages and keeps order', () => {
    const rows = chatRows([
      user(1),
      assistant(2, 'A'),
      tool(3, 'find_items'),
      tool(4, 'get_prices'),
      assistant(5, 'B'),
    ]);

    expect(rows.map((row) => row.kind)).toEqual(['user', 'assistant', 'tools', 'assistant']);
    expect(rows[2]).toMatchObject({
      id: '3',
      runs: [
        { id: '3', name: 'find_items', status: 'ok' },
        { id: '4', name: 'get_prices', status: 'ok' },
      ],
    });
  });

  it('splits a tool group when another message sits between the calls', () => {
    const rows = chatRows([tool(1, 'a'), assistant(2, 'text'), tool(3, 'b')]);
    expect(rows.map((row) => row.kind)).toEqual(['tools', 'assistant', 'tools']);
  });

  it('marks a declined write', () => {
    expect(chatRows([tool(3, 'add_item', { declined: true })])[0]).toMatchObject({
      runs: [{ status: 'declined' }],
    });
  });

  it('keeps an attachment-only user message', () => {
    const png: ChatAttachment = {
      id: 9,
      name: 'shot.png',
      mimeType: 'image/png',
      size: 8,
      createdAt: '2026-11-21T10:00:00.000Z',
    };
    expect(chatRows([user(1, '', [png])])[0]).toMatchObject({ kind: 'user', text: '', attachments: [png] });
  });

  it('hides leaked tool-call markup in assistant prose', () => {
    const rows = chatRows([assistant(1, 'before <|DSML|invoke name="x">after')]);
    expect(rows[0]).toMatchObject({ kind: 'assistant', text: 'before' });
  });
});
