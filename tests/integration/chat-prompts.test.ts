import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, ensureDefaultSources, migrate, openDb, type Db } from '@profile/core';
import {
  activePromptViews,
  composeChatPrompt,
  listEvents,
  listPromptVersions,
  rollbackEvent,
  updateChatPrompt,
} from '@profile/core';
import { ChatPromptUpdateSchema } from '@profile/shared/contracts';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-chat-prompts-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
  ensureDefaultSources(db);
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

function prompt(kind: 'system' | 'skill', name: string): { body: string; version: number; enabled: boolean } {
  const row = activePromptViews(db).find((entry) => entry.kind === kind && entry.name === name);
  if (!row) throw new Error(`missing prompt ${kind}/${name}`);
  return row;
}

describe('assistant prompts', () => {
  it('seeds the default system prompt and skills and composes them once', () => {
    expect(prompt('system', 'site').version).toBe(1);
    expect(activePromptViews(db).filter((entry) => entry.kind === 'skill').map((entry) => entry.name).sort()).toEqual([
      'inventory',
      'pricing',
      'writes',
    ]);

    const composed = composeChatPrompt(db);
    expect(composed).toContain('You are the Stalzone Profile assistant');
    expect(composed).toContain('## inventory');
    expect(composed).toContain('## Rules');
    expect(composed).toContain('Never buy or list on the auction');
    expect(composed.indexOf('## Rules')).toBeGreaterThan(composed.indexOf('## writes'));
  });

  it('appends a version, activates it, audits and rolls back the pointer', () => {
    const result = updateChatPrompt(
      db,
      ChatPromptUpdateSchema.parse({
        kind: 'system',
        name: 'site',
        body: 'A shorter system prompt.',
        enabled: true,
      }),
    );

    expect(result.dryRun).toBe(false);
    expect(prompt('system', 'site')).toMatchObject({ body: 'A shorter system prompt.', version: 2 });
    expect(composeChatPrompt(db)).toContain('A shorter system prompt.');
    expect(listPromptVersions(db, 'system', 'site').map((row) => row.version)).toEqual([2, 1]);

    const [event] = listEvents(db);
    expect(event).toMatchObject({ action: 'chat.prompt.update', entity: 'chat' });
    rollbackEvent(db, event.id, false);
    expect(prompt('system', 'site')).toMatchObject({ version: 1 });
  });

  it('drops a disabled skill from the composed prompt', () => {
    updateChatPrompt(
      db,
      ChatPromptUpdateSchema.parse({
        kind: 'skill',
        name: 'pricing',
        body: 'Auction data is read-only.',
        enabled: false,
      }),
    );

    expect(composeChatPrompt(db)).not.toContain('## pricing');
    expect(prompt('skill', 'pricing').enabled).toBe(false);
  });

  it('does not write or log on a dry run', () => {
    const result = updateChatPrompt(
      db,
      ChatPromptUpdateSchema.parse({ kind: 'skill', name: 'inventory', body: 'Changed', dryRun: true }),
    );
    expect(result.dryRun).toBe(true);
    expect(prompt('skill', 'inventory').version).toBe(1);
    expect(listEvents(db)).toHaveLength(0);
  });

  it('creates a new named prompt with version one', () => {
    updateChatPrompt(
      db,
      ChatPromptUpdateSchema.parse({ kind: 'skill', name: 'containers', body: 'Read the fill.', enabled: true }),
    );
    expect(prompt('skill', 'containers')).toMatchObject({ version: 1, enabled: true });
    expect(composeChatPrompt(db)).toContain('## containers');
  });
});
