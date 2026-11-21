import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, migrate, openDb, type Db, listEvents } from '@profile/core';
import { runChatTurn } from '@profile/mcp';
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
});
