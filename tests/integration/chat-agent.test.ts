import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, migrate, openDb, type Db, listEvents, updateChatSettings } from '@profile/core';
import { runChatTurn } from '@profile/mcp';
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

    const confirmed = await runChatTurn(
      db,
      {
        threadId: first.thread.id,
        message: 'Confirmed.',
        confirm: { toolName: first.pending!.toolName, args: first.pending!.args },
      },
      { fetchImpl: confirmFetch },
    );

    expect(confirmed.pending).toBeNull();
    expect(followUp).toBe(1);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM storage WHERE name = 'QA stash'`).get() as { c: number }).c).toBe(1);
    expect(listEvents(db).filter((event) => event.action === 'inventory.storage.create')).toHaveLength(1);
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
});
