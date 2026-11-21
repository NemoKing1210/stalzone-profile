import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendChatMessage,
  closeDb,
  createChatThread,
  ensureDefaultSources,
  flushLogs,
  listEvents,
  migrate,
  openDb,
  queryLogs,
  runWithEventContext,
  updateChatSettings,
  type Db,
} from '@profile/core';
import { runChatTurn, toolDefinitions } from '@profile/mcp';
import { CHAT_PROVIDER_META, ChatSettingsUpdateSchema, type ChatProvider } from '@profile/shared/contracts';
import { setChatSettings } from './chat-test-helpers';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-chat-agent-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function useProvider(db: Db, provider: ChatProvider, baseUrl: string): void {
  process.env[CHAT_PROVIDER_META[provider].keyEnv] = 'test-key';
  updateChatSettings(db, ChatSettingsUpdateSchema.parse({ provider, baseUrl, model: 'test-model' }));
}

const notes = {
  name: 'notes.md',
  mimeType: 'text/markdown',
  data: Buffer.from('# Notes\nRemember the stash.').toString('base64'),
};
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const screenshot = {
  name: 'shot.png',
  mimeType: 'image/png',
  data: Buffer.from(png).toString('base64'),
};

function toolCall(name: string, args: Record<string, unknown>, id = 'call-1') {
  return { choices: [{ message: { content: '', tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] };
}

describe('chat agent', () => {
  it('runs a read tool through the MCP registry and stores its payload', async () => {
    setChatSettings(db);
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      return call === 1 ? json(toolCall('get_character', {})) : json({ choices: [{ message: { content: 'Here is your character.' } }] });
    }) as typeof fetch;

    const result = await runChatTurn(db, { message: 'Who am I?' }, { fetchImpl });

    expect(result.error).toBeNull();
    expect(result.messages.filter((message) => message.role === 'tool')[0]).toMatchObject({
      toolName: 'get_character',
    });
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Here is your character.' });
    expect(result.pending).toBeNull();
  });

  it('exposes the real tool arguments to the model', () => {
    const find = toolDefinitions(['find_items']).find((definition) => definition.name === 'find_items');
    const parameters = find?.parameters as { type?: string; properties?: Record<string, unknown>; $schema?: string };
    expect(parameters.type).toBe('object');
    expect(Object.keys(parameters.properties ?? {})).toEqual(expect.arrayContaining(['q', 'kind', 'rank', 'slot', 'limit']));
    expect(parameters).not.toHaveProperty('$schema');
    for (const definition of toolDefinitions()) {
      expect(definition.parameters).toMatchObject({ type: 'object' });
    }
  });

  it('forces a text answer on the last round instead of ending after a tool call', async () => {
    setChatSettings(db);
    const bodies: Record<string, unknown>[] = [];
    let call = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      call += 1;
      return call === 1
        ? json(toolCall('get_character', {}))
        : json({ choices: [{ message: { content: 'Final answer.' } }] });
    }) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: 'Who am I?' }, { fetchImpl, maxRounds: 2 });

    expect(result.error).toBeNull();
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Final answer.' });
    expect(bodies[1]).not.toHaveProperty('tools');
  });

  it('recovers DeepSeek tool markup returned as text', async () => {
    setChatSettings(db);
    updateChatSettings(db, ChatSettingsUpdateSchema.parse({ readToolAllowList: ['get_character', 'find_items'] }));
    const bar = '\uff5c';
    const dsml = [
      `<${bar}DSML${bar} calls>`,
      `<${bar}DSML${bar} invoke name="find_items">`,
      `<${bar}DSML${bar} parameter name="q" string="true">АК</${bar}DSML${bar} parameter>`,
      `<${bar}DSML${bar} parameter name="limit">1</${bar}DSML${bar} parameter>`,
      `</${bar}DSML${bar} invoke>`,
      `</${bar}DSML${bar} calls>`,
    ].join('\n');
    const bodies: string[] = [];
    let call = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      call += 1;
      return call === 1
        ? json({ choices: [{ message: { content: `Проверю.\n\n${dsml}` } }] })
        : json({ choices: [{ message: { content: 'Готово.' } }] });
    }) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: 'Топ' }, { fetchImpl });

    expect(result.error).toBeNull();
    expect(result.messages.some((message) => message.role === 'tool' && message.toolName === 'find_items')).toBe(true);
    expect(result.messages.map((message) => message.content).join('\n')).not.toContain(`${bar}DSML`);
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Готово.' });
    const second = JSON.parse(bodies[1]!) as { messages: { role: string }[] };
    expect(second.messages.some((message) => message.role === 'tool')).toBe(true);
  });

  it('reads an OpenAI content-parts answer', async () => {
    setChatSettings(db);
    const fetchImpl = (async () =>
      json({ choices: [{ message: { content: [{ type: 'text', text: 'Привет.' }] } }] })) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: 'Привет' }, { fetchImpl });

    expect(result.error).toBeNull();
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Привет.' });
  });

  it('keeps stored tool markup out of the next transcript', async () => {
    setChatSettings(db);
    const threadId = createChatThread(db, 'Old');
    const bar = '\uff5c';
    appendChatMessage(db, {
      threadId,
      role: 'assistant',
      content: `Перед.\n\n<${bar}DSML${bar} calls>\n<${bar}DSML${bar} invoke name="find_items">\n</${bar}DSML${bar} invoke>\n</${bar}DSML${bar} calls>`,
    });
    const bodies: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return json({ choices: [{ message: { content: 'Дальше.' } }] });
    }) as unknown as typeof fetch;

    const result = await runChatTurn(db, { threadId, message: 'Продолжай' }, { fetchImpl });

    expect(result.error).toBeNull();
    expect(bodies[0]).not.toContain(`${bar}DSML`);
    expect(bodies[0]).toContain('Перед.');
  });

  it('returns an OpenAI-compatible tool result as a protocol tool message', async () => {
    setChatSettings(db);
    const bodies: string[] = [];
    let call = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      call += 1;
      return call === 1
        ? json(toolCall('get_character', {}, 'call-42'))
        : json({ choices: [{ message: { content: 'Here you are.' } }] });
    }) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: 'Who am I?' }, { fetchImpl });

    expect(result.error).toBeNull();
    const second = JSON.parse(bodies[1]!) as { messages: Record<string, unknown>[] };
    const assistant = second.messages.findIndex((message) => message.role === 'assistant' && message.tool_calls);
    expect(assistant).toBeGreaterThanOrEqual(0);
    expect(second.messages[assistant + 1]).toMatchObject({ role: 'tool', tool_call_id: 'call-42' });
    // The transcript was sent once; the tool round must not resend it as a second user message.
    expect(second.messages.filter((message) => message.role === 'user')).toHaveLength(1);
  });

  it('returns Anthropic tool results as tool_result blocks', async () => {
    useProvider(db, 'anthropic', 'http://anthropic.test/v1');
    const bodies: string[] = [];
    let call = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      call += 1;
      return call === 1
        ? json({
            content: [
              { type: 'text', text: 'Looking.' },
              { type: 'tool_use', id: 'toolu_1', name: 'get_character', input: {} },
            ],
          })
        : json({ content: [{ type: 'text', text: 'Done.' }] });
    }) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: 'Who am I?' }, { fetchImpl });

    expect(result.error).toBeNull();
    const second = JSON.parse(bodies[1]!) as { messages: Record<string, unknown>[] };
    expect(second.messages[1]).toMatchObject({ role: 'assistant' });
    expect(JSON.stringify(second.messages[1])).toContain('"tool_use"');
    expect(JSON.stringify(second.messages[2])).toContain('"tool_result"');
    expect(JSON.stringify(second.messages[2])).toContain('toolu_1');
  });

  it('returns Google tool results as functionResponse parts', async () => {
    useProvider(db, 'google', 'http://google.test/v1beta');
    const bodies: string[] = [];
    let call = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      call += 1;
      return call === 1
        ? json({ candidates: [{ content: { parts: [{ functionCall: { name: 'get_character', args: {} } }] } }] })
        : json({ candidates: [{ content: { parts: [{ text: 'Done.' }] } }] });
    }) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: 'Who am I?' }, { fetchImpl });

    expect(result.error).toBeNull();
    const second = JSON.parse(bodies[1]!) as { contents: Record<string, unknown>[] };
    expect(second.contents[1]).toMatchObject({ role: 'model' });
    expect(JSON.stringify(second.contents[1])).toContain('"functionCall"');
    expect(JSON.stringify(second.contents[2])).toContain('"functionResponse"');
  });

  it('applies the stored temperature and token budget to the provider request', async () => {
    setChatSettings(db);
    updateChatSettings(db, ChatSettingsUpdateSchema.parse({ temperature: 0.7, maxTokens: 512, retries: 0 }));
    const bodies: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return json({ choices: [{ message: { content: 'ok' } }] });
    }) as unknown as typeof fetch;

    await runChatTurn(db, { message: 'Hello' }, { fetchImpl });

    expect(JSON.parse(bodies[0]!)).toMatchObject({ temperature: 0.7, max_tokens: 512 });
  });

  it('retries a transient provider failure before giving up', async () => {
    setChatSettings(db);
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      return call === 1 ? new Response('busy', { status: 503 }) : json({ choices: [{ message: { content: 'Recovered.' } }] });
    }) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: 'Hello' }, { fetchImpl });

    expect(result.error).toBeNull();
    expect(call).toBe(2);
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Recovered.' });
  });

  it('does not retry a rejected request', async () => {
    setChatSettings(db);
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      return new Response('bad request', { status: 400 });
    }) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: 'Hello' }, { fetchImpl });

    expect(result.error).toBe('AI_HTTP_400');
    expect(call).toBe(1);
  });

  it('marks a failed turn on its user message and retries that message in place', async () => {
    setChatSettings(db);
    const failing = (async () => new Response('bad request', { status: 400 })) as unknown as typeof fetch;
    const failed = await runChatTurn(db, { message: 'Hello' }, { fetchImpl: failing });

    expect(failed.error).toBe('AI_HTTP_400');
    const user = failed.messages.find((message) => message.role === 'user');
    expect(user).toMatchObject({ content: 'Hello', error: 'AI_HTTP_400' });
    if (!user) throw new Error('missing user message');

    const succeeding = (async () =>
      json({ choices: [{ message: { content: 'Recovered.' } }] })) as unknown as typeof fetch;
    const retried = await runChatTurn(db, { message: '', retryOf: user.id }, { fetchImpl: succeeding });

    expect(retried.error).toBeNull();
    expect(retried.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(retried.messages.find((message) => message.role === 'user')).toMatchObject({
      id: user.id,
      content: 'Hello',
      error: null,
    });
    expect(retried.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Recovered.' });
  });

  it('discards a failed attempt\'s partial rows before retrying', async () => {
    setChatSettings(db);
    const failing = (async () => new Response('bad request', { status: 400 })) as unknown as typeof fetch;
    const failed = await runChatTurn(db, { message: 'Hello' }, { fetchImpl: failing });
    const userId = failed.messages.find((message) => message.role === 'user')?.id;
    if (userId == null) throw new Error('missing user message');
    appendChatMessage(db, { threadId: failed.thread.id, role: 'assistant', content: 'Stale partial answer' });
    appendChatMessage(db, {
      threadId: failed.thread.id,
      role: 'tool',
      content: '{}',
      toolName: 'find_items',
      toolCallId: 'stale-call',
      payload: {},
    });

    const succeeding = (async () =>
      json({ choices: [{ message: { content: 'Fresh answer.' } }] })) as unknown as typeof fetch;
    const retried = await runChatTurn(db, { message: '', retryOf: userId }, { fetchImpl: succeeding });

    expect(retried.messages.some((message) => message.content === 'Stale partial answer')).toBe(false);
    expect(retried.messages.some((message) => message.toolCallId === 'stale-call')).toBe(false);
    expect(retried.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Fresh answer.' });
  });

  it('does not mark a stopped turn as not delivered', async () => {
    setChatSettings(db);
    const controller = new AbortController();
    const aborting = (async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    }) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: 'Stop' }, { fetchImpl: aborting, signal: controller.signal });

    expect(result.messages.find((message) => message.role === 'user')).toMatchObject({ error: null });
  });

  it('sends a stable OpenCode session id on every Go request', async () => {
    useProvider(db, 'opencode-go', 'https://opencode.ai/inference/go/openai/v1');
    const headers: Record<string, string>[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      headers.push((init.headers ?? {}) as Record<string, string>);
      return json({ choices: [{ message: { content: 'pong' } }] });
    }) as typeof fetch;

    const first = await runChatTurn(db, { message: 'ping', files: [] }, { fetchImpl });
    await runChatTurn(db, { threadId: first.thread.id, message: 'again', files: [] }, { fetchImpl });

    const session = headers[0]?.['x-opencode-session'];
    expect(session).toMatch(/^ses_[0-9a-f]{32}$/);
    expect(headers[1]?.['x-opencode-session']).toBe(session);
    expect(first.error).toBeNull();
  });

  it('does not send the OpenCode session header to another provider', async () => {
    useProvider(db, 'openai', 'https://api.openai.com/v1');
    const headers: Record<string, string>[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      headers.push((init.headers ?? {}) as Record<string, string>);
      return json({ choices: [{ message: { content: 'pong' } }] });
    }) as typeof fetch;

    await runChatTurn(db, { message: 'ping', files: [] }, { fetchImpl });
    expect(headers[0]?.['x-opencode-session']).toBeUndefined();
  });

  it('pauses a write with its dry-run diff and only writes after confirmation', async () => {
    setChatSettings(db);
    const fetchImpl = (async () =>
      json(toolCall('create_storage', { name: 'QA stash', kind: 'stash' }))) as typeof fetch;

    const first = await runChatTurn(db, { message: 'Create a stash.' }, { fetchImpl });
    expect(first.pending).toMatchObject({ toolName: 'create_storage' });
    expect(first.pending?.human).toContain('QA stash');
    expect(listEvents(db).filter((event) => event.action.startsWith('inventory.'))).toHaveLength(0);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM storage WHERE name = 'QA stash'`).get() as { c: number }).c).toBe(0);

    let followUp = 0;
    const confirmFetch = (async () => {
      followUp += 1;
      return json(toolCall('create_storage', { name: 'QA stash', kind: 'stash' }));
    }) as typeof fetch;

    const confirmed = await runWithEventContext({ requestId: 'chat-write-1', origin: 'http' }, () =>
      runChatTurn(
        db,
        {
          threadId: first.thread.id,
          message: 'Confirmed.',
          confirm: { toolName: first.pending!.toolName, args: first.pending!.args },
        },
        { fetchImpl: confirmFetch },
      ),
    );

    expect(confirmed.pending).toBeNull();
    expect(confirmed.error).toBeNull();
    expect(followUp).toBe(1);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM storage WHERE name = 'QA stash'`).get() as { c: number }).c).toBe(1);
    const created = listEvents(db).find((event) => event.action === 'inventory.storage.create');
    expect(created).toMatchObject({ request_id: 'chat-write-1', origin: 'http' });
  });

  it('refuses an unconfirmed write and returns the refusal to the model', async () => {
    setChatSettings(db);
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      if (call === 1) return json(toolCall('create_storage', { name: 'Nope', kind: 'stash' }));
      return json({ choices: [{ message: { content: 'Understood.' } }] });
    }) as typeof fetch;

    const first = await runChatTurn(db, { message: 'Create a stash.' }, { fetchImpl });
    expect(first.pending).not.toBeNull();

    const declined = await runChatTurn(
      db,
      { threadId: first.thread.id, message: 'No.', decline: { toolName: 'create_storage' } },
      { fetchImpl },
    );
    expect(declined.pending).toBeNull();
    expect((db.prepare(`SELECT COUNT(*) AS c FROM storage WHERE name = 'Nope'`).get() as { c: number }).c).toBe(0);
  });

  it('sends text files in the transcript and images as an image part to an OpenAI-compatible provider', async () => {
    setChatSettings(db);
    const bodies: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return json({ choices: [{ message: { content: 'Seen.' } }] });
    }) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: '', files: [notes, screenshot] }, { fetchImpl });

    expect(result.error).toBeNull();
    expect(result.messages[0]!.attachments).toEqual([
      expect.objectContaining({ name: 'notes.md', mimeType: 'text/plain; charset=utf-8' }),
      expect.objectContaining({ name: 'shot.png', mimeType: 'image/png' }),
    ]);
    expect(result.messages[0]!.attachments[0]).not.toHaveProperty('data');
    expect(bodies[0]).toContain('[Attached file: notes.md]');
    expect(bodies[0]).toContain('Remember the stash.');
    expect(bodies[0]).toContain('"type":"image_url"');
    expect(bodies[0]).toContain(`data:image/png;base64,${Buffer.from(png).toString('base64')}`);
  });

  it('keeps an earlier image available on the next turn of the same thread', async () => {
    setChatSettings(db);
    const bodies: string[] = [];
    let call = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      call += 1;
      return json({ choices: [{ message: { content: call === 1 ? 'Noted.' : 'Still here.' } }] });
    }) as unknown as typeof fetch;

    const first = await runChatTurn(db, { message: 'Remember this shot.', files: [screenshot] }, { fetchImpl });
    await runChatTurn(db, { threadId: first.thread.id, message: 'What did I show you?' }, { fetchImpl });

    expect(bodies[1]).toContain(`data:image/png;base64,${Buffer.from(png).toString('base64')}`);
  });

  it('maps attachments to Anthropic image blocks and Google inline data', async () => {
    setChatSettings(db);

    useProvider(db, 'anthropic', 'http://anthropic.test/v1');
    const anthropicBodies: string[] = [];
    const anthropicFetch = (async (_url: string, init: RequestInit) => {
      anthropicBodies.push(String(init.body));
      return json({ content: [{ type: 'text', text: 'Anthropic saw it.' }] });
    }) as unknown as typeof fetch;
    await runChatTurn(db, { message: 'Look', files: [screenshot, notes] }, { fetchImpl: anthropicFetch });
    expect(anthropicBodies[0]).toContain('"type":"image"');
    expect(anthropicBodies[0]).toContain('"media_type":"image/png"');
    expect(anthropicBodies[0]).toContain('[Attached file: notes.md]');

    useProvider(db, 'google', 'http://google.test/v1beta');
    const googleBodies: string[] = [];
    const googleFetch = (async (_url: string, init: RequestInit) => {
      googleBodies.push(String(init.body));
      return json({ candidates: [{ content: { parts: [{ text: 'Google saw it.' }] } }] });
    }) as unknown as typeof fetch;
    await runChatTurn(db, { message: 'Look', files: [screenshot] }, { fetchImpl: googleFetch });
    expect(googleBodies[0]).toContain('"inlineData"');
    expect(googleBodies[0]).toContain('"mimeType":"image/png"');
  });

  it('logs every tool call and the finished turn under the turn request id', async () => {
    setChatSettings(db);
    let providerCalls = 0;
    const fetchImpl = (async () => {
      providerCalls += 1;
      return providerCalls === 1
        ? json(toolCall('get_character', {}))
        : json({ choices: [{ message: { content: 'Here is your character.' } }] });
    }) as typeof fetch;

    const result = await runWithEventContext({ requestId: 'chat-turn-1', origin: 'http' }, () =>
      runChatTurn(db, { message: 'Who am I?' }, { fetchImpl }),
    );
    expect(result.error).toBeNull();
    flushLogs(db);

    const { entries } = queryLogs(db, { requestId: 'chat-turn-1', limit: 100 });
    const tool = entries.find((entry) => entry.message === 'mcp call');
    expect(tool).toMatchObject({ level: 'info', category: 'mcp', source: 'server' });
    expect(tool?.context).toMatchObject({ tool: 'getCharacter', channel: 'chat' });
    expect(tool?.durationMs).toEqual(expect.any(Number));

    const turn = entries.find((entry) => entry.message === 'chat turn finished');
    expect(turn).toMatchObject({ level: 'info', category: 'app', source: 'server' });
    expect(turn?.context).toMatchObject({ provider: 'ollama', rounds: 2, toolCalls: 1, ok: true });
    expect(JSON.stringify(entries.map((entry) => entry.context))).not.toContain('Who am I?');
  });

  it('logs a failed turn at warn without the user message', async () => {
    setChatSettings(db);
    const fetchImpl = (async () => new Response('bad request', { status: 400 })) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: 'private words' }, { fetchImpl });
    expect(result.error).toBe('AI_HTTP_400');
    flushLogs(db);

    const { entries } = queryLogs(db, { limit: 100 });
    const turn = entries.find((entry) => entry.message === 'chat turn finished');
    expect(turn).toMatchObject({ level: 'warn', category: 'app', source: 'server' });
    expect(turn?.context).toMatchObject({ ok: false, error: 'AI_HTTP_400' });
    expect(JSON.stringify(turn?.context)).not.toContain('private words');
  });
});
