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
  listChatModels,
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

  it('lists OpenAI-compatible models with the bearer key and unknown labels', async () => {
    process.env.NUXT_AI_OPENAI_API_KEY = 'provider-key';
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url: String(url), headers: (init.headers ?? {}) as Record<string, string> });
      return new Response(
        JSON.stringify({ data: [{ id: 'gpt-4.1', display_name: 'GPT-4.1' }, { id: 'gpt-4.1-mini' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const result = await listChatModels(db, {}, { fetchImpl });

    expect(result).toEqual({
      ok: true,
      status: 200,
      message: 'OpenAI: connected',
      models: [
        { id: 'gpt-4.1', label: 'GPT-4.1' },
        { id: 'gpt-4.1-mini', label: null },
      ],
    });
    expect(seen[0]?.url).toBe('https://api.openai.com/v1/models');
    expect(seen[0]?.headers.authorization).toBe('Bearer provider-key');
    expect(listEvents(db)).toHaveLength(0);
  });

  it('uses an unsaved apiKeyEnv override and the Anthropic headers', async () => {
    process.env.PROFILE_TEST_CHAT_KEY = 'override-key';
    const seen: Record<string, string>[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen.push((init.headers ?? {}) as Record<string, string>);
      return new Response(JSON.stringify({ data: [{ id: 'claude-sonnet', display_name: 'Claude Sonnet' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await listChatModels(db, { provider: 'anthropic', apiKeyEnv: 'PROFILE_TEST_CHAT_KEY' }, { fetchImpl });

    expect(result.models).toEqual([{ id: 'claude-sonnet', label: 'Claude Sonnet' }]);
    expect(seen[0]?.['x-api-key']).toBe('override-key');
    expect(seen[0]?.['anthropic-version']).toBe('2023-06-01');
    expect(getChatSettingsRow(db).api_key_env).toBeNull();
  });

  it('filters Google models to generateContent, strips the prefix and sorts them', async () => {
    process.env.PROFILE_TEST_CHAT_KEY = 'google-key';
    let calledUrl = '';
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url);
      return new Response(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-2.0-flash',
              displayName: 'Gemini Flash',
              supportedGenerationMethods: ['generateContent', 'countTokens'],
            },
            { name: 'models/embedding-001', displayName: 'Embed', supportedGenerationMethods: ['embedContent'] },
            { name: 'models/gemini-1.5-pro', displayName: 'Gemini Pro', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-2.0-flash', displayName: 'Duplicate', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-1.5-pro', supportedGenerationMethods: ['generateContent'] },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const result = await listChatModels(db, { provider: 'google', apiKeyEnv: 'PROFILE_TEST_CHAT_KEY' }, { fetchImpl });

    expect(result.models.map((model) => model.id)).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash']);
    expect(result.models[0]).toEqual({ id: 'gemini-1.5-pro', label: 'Gemini Pro' });
    expect(calledUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models?key=google-key');
  });

  it('returns no models without a key or on an HTTP failure', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const missing = await listChatModels(db, {}, { fetchImpl });
    expect(missing).toMatchObject({ ok: false, status: null, models: [] });
    expect(missing.message).toContain('NUXT_AI_OPENAI_API_KEY');
    expect(calls).toBe(0);

    process.env.NUXT_AI_OPENAI_API_KEY = 'provider-key';
    const rejected = await listChatModels(db, {}, { fetchImpl });
    expect(rejected).toMatchObject({ ok: false, status: 401, models: [] });
    expect(calls).toBe(1);
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
