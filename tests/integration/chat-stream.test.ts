import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDb,
  ensureDefaultSources,
  listChatMessages,
  migrate,
  openDb,
  updateChatSettings,
  type Db,
} from '@profile/core';
import { runChatTurnStream } from '@profile/mcp';
import { CHAT_PROVIDER_META, ChatSettingsUpdateSchema, ChatStreamEventSchema, type ChatStreamEvent } from '@profile/shared/contracts';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-chat-stream-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
  process.env[CHAT_PROVIDER_META.openai.keyEnv] = 'test-key';
  updateChatSettings(
    db,
    ChatSettingsUpdateSchema.parse({ provider: 'openai', baseUrl: 'http://fake.local/v1', model: 'test-model' }),
  );
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A body delivered in small pieces, so the parser must survive split JSON and split events. */
function sseResponse(body: string, size = 7): Response {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < bytes.length; index += size) {
        controller.enqueue(bytes.slice(index, index + size));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
}

function collect(): { events: ChatStreamEvent[]; emit: (event: ChatStreamEvent) => void } {
  const events: ChatStreamEvent[] = [];
  return { events, emit: (event) => events.push(ChatStreamEventSchema.parse(event)) };
}

describe('chat streaming', () => {
  it('emits reasoning and text deltas, then one canonical done event', async () => {
    const body = [
      'data: {"choices":[{"delta":{"reasoning_content":"think "}}]}',
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
      'data: [DONE]',
      '',
    ].join('\n\n');
    const fetchImpl = (async () => sseResponse(body)) as unknown as typeof fetch;
    const { events, emit } = collect();

    await runChatTurnStream(db, { message: 'Hi' }, emit, { fetchImpl });

    expect(events.map((event) => event.type)).toEqual(['meta', 'delta', 'delta', 'delta', 'done']);
    expect(events[1]).toMatchObject({ type: 'delta', kind: 'reasoning', text: 'think ' });
    const done = events.at(-1);
    if (done?.type !== 'done') throw new Error('no done event');
    expect(done.error).toBeNull();
    expect(done.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Hello',
      reasoning: 'think',
      meta: { model: 'test-model', usage: { input: 3, output: 2, total: 5 } },
    });
    expect(listChatMessages(db, done.thread.id)).toEqual(done.messages);
  });

  it('keeps only the user message when the stream is aborted', async () => {
    const controller = new AbortController();
    const fetchImpl = (async (_url: string, init?: RequestInit) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(stream) {
            stream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
            init?.signal?.addEventListener('abort', () => stream.error(new Error('aborted')));
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )) as unknown as typeof fetch;
    const { events, emit: collectEvent } = collect();
    const emit = (event: ChatStreamEvent): void => {
      collectEvent(event);
      if (event.type === 'delta') controller.abort();
    };

    await runChatTurnStream(db, { message: 'Hi' }, emit, { fetchImpl, signal: controller.signal });

    expect(events.filter((event) => event.type === 'delta')).toHaveLength(1);
    const done = events.at(-1);
    if (done?.type !== 'done') throw new Error('no done event');
    expect(done.error).toBeTruthy();
    expect(done.messages.some((message) => message.role === 'assistant')).toBe(false);
    expect(done.messages[0]?.role).toBe('user');
  });
});
