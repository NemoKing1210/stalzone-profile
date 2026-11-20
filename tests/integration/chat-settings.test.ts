import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, migrate, openDb, type Db } from '@profile/core';
import {
  chatSettingsRead,
  getChatSettingsRow,
  rollbackEvent,
  listEvents,
  testChatConnection,
  updateChatSettings,
} from '@profile/core';
import { ChatSettingsUpdateSchema } from '@profile/shared/contracts';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-chat-settings-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.NUXT_AI_OPENAI_API_KEY;
  delete process.env.PROFILE_TEST_CHAT_KEY;
});

describe('assistant settings', () => {
  it('seeds one row with a safe default and writes an audited update', () => {
    expect(getChatSettingsRow(db)).toMatchObject({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      data_scope_prices: 0,
      data_scope_logs: 0,
    });

    const result = updateChatSettings(
      db,
      ChatSettingsUpdateSchema.parse({
        provider: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3.2',
        temperature: 0.4,
        maxTokens: 4096,
        readToolAllowList: ['get_character', 'find_items'],
        dataScopePrices: true,
      }),
    );

    expect(result.dryRun).toBe(false);
    expect(getChatSettingsRow(db)).toMatchObject({
      provider: 'ollama',
      model: 'llama3.2',
      temperature: 0.4,
      max_tokens: 4096,
      data_scope_prices: 1,
    });
    expect(JSON.parse(getChatSettingsRow(db).read_tool_allow_list)).toEqual(['find_items', 'get_character']);
    const [event] = listEvents(db);
    expect(event).toMatchObject({ action: 'chat.settings.update', entity: 'chat' });
    expect(JSON.parse(event.before!).provider).toBe('openai');
    expect(JSON.parse(event.after!).provider).toBe('ollama');

    rollbackEvent(db, event.id, false);
    expect(getChatSettingsRow(db).provider).toBe('openai');
  });

  it('does not write on a dry run', () => {
    const before = getChatSettingsRow(db).updated_at;
    const result = updateChatSettings(
      db,
      ChatSettingsUpdateSchema.parse({ provider: 'mistral', dryRun: true }),
    );
    expect(result.dryRun).toBe(true);
    expect(result.diff.human).toContain('provider');
    expect(getChatSettingsRow(db).provider).toBe('openai');
    expect(getChatSettingsRow(db).updated_at).toBe(before);
    expect(listEvents(db)).toHaveLength(0);
  });

  it('resolves the key from the named env variable without storing it', () => {
    process.env.PROFILE_TEST_CHAT_KEY = 'secret-value';
    updateChatSettings(
      db,
      ChatSettingsUpdateSchema.parse({
        provider: 'openai',
        apiKeyEnv: 'PROFILE_TEST_CHAT_KEY',
      }),
    );

    const read = chatSettingsRead(db);
    expect(read.apiKeyConfigured).toBe(true);
    expect(read.apiKeyEnv).toBe('PROFILE_TEST_CHAT_KEY');
    expect(JSON.stringify(read)).not.toContain('secret-value');
  });

  it('falls back to the provider-specific env variable', () => {
    process.env.NUXT_AI_OPENAI_API_KEY = 'provider-key';
    const read = chatSettingsRead(db);
    expect(read.apiKeyConfigured).toBe(true);
    expect(read.enabled).toBe(true);
    expect(read.apiKeyEnv).toBeNull();
    expect(read.apiKeyEnvResolved).toBe('NUXT_AI_OPENAI_API_KEY');
  });

  it('tests a connection with the provider endpoint and never sends the key anywhere else', async () => {
    process.env.NUXT_AI_OPENAI_API_KEY = 'provider-key';
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url: String(url), headers: (init.headers ?? {}) as Record<string, string> });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const result = await testChatConnection(db, {}, { fetchImpl });

    expect(result).toMatchObject({ ok: true, provider: 'openai', status: 200 });
    expect(seen[0]?.url).toBe('https://api.openai.com/v1/models');
    expect(seen[0]?.headers.authorization).toBe('Bearer provider-key');
  });

  it('reports the missing env variable instead of calling the provider', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const result = await testChatConnection(db, {}, { fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('NUXT_AI_OPENAI_API_KEY');
    expect(called).toBe(false);
  });
});
