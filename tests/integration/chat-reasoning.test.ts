import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDb,
  ensureDefaultSources,
  migrate,
  openDb,
  updateChatSettings,
  type Db,
} from '@profile/core';
import { runChatTurn } from '@profile/mcp';
import { CHAT_PROVIDER_META, ChatSettingsUpdateSchema } from '@profile/shared/contracts';
import { setChatSettings } from './chat-test-helpers';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-chat-reasoning-'));
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

describe('chat reasoning and meta', () => {
  it('stores the reasoning and usage the provider returned, without re-sending reasoning', async () => {
    process.env[CHAT_PROVIDER_META.openai.keyEnv] = 'test-key';
    updateChatSettings(
      db,
      ChatSettingsUpdateSchema.parse({ provider: 'openai', baseUrl: 'http://fake.local/v1', model: 'test-model' }),
    );

    const bodies: string[] = [];
    let call = 0;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ''));
      call += 1;
      if (call === 1) {
        return json({
          choices: [
            {
              message: {
                content: '',
                reasoning_content: 'pick the cheapest lot',
                tool_calls: [
                  { id: 'call-1', type: 'function', function: { name: 'get_character', arguments: '{}' } },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
      }
      return json({
        choices: [{ message: { content: 'Cheapest is 12k.', reasoning_content: 'compare prices' } }],
        usage: { prompt_tokens: 20, completion_tokens: 7, total_tokens: 27 },
      });
    }) as typeof fetch;

    const result = await runChatTurn(db, { message: 'Prices?' }, { fetchImpl });
    expect(result.error).toBeNull();

    const answers = result.messages.filter((message) => message.role === 'assistant');
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({
      content: 'Cheapest is 12k.',
      reasoning: 'compare prices',
      meta: { model: 'test-model', usage: { input: 20, output: 7, total: 27 } },
    });
    expect(answers[0]?.meta?.durationMs).toEqual(expect.any(Number));
    expect(bodies[1]).not.toContain('compare prices');
  });

  it('leaves reasoning and meta null when the provider sends neither', async () => {
    setChatSettings(db);
    const fetchImpl = (async () =>
      json({ choices: [{ message: { content: 'Plain answer.' } }] })) as unknown as typeof fetch;

    const result = await runChatTurn(db, { message: 'Hi' }, { fetchImpl });
    const answer = result.messages.at(-1);
    expect(answer).toMatchObject({ role: 'assistant', content: 'Plain answer.', reasoning: null });
    expect(answer?.meta).toMatchObject({ model: 'test-model' });
    expect(answer?.meta?.usage).toBeUndefined();
  });
});
