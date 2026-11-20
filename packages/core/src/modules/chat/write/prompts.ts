import type { ChatPromptUpdate } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, type WriteResult } from '../../../platform/journal/index.js';
import * as repo from '../repo/prompts.js';

interface PromptState {
  promptId: number | null;
  kind: string;
  name: string;
  body: string;
  version: number;
  enabled: boolean;
}

function current(db: Db, kind: string, name: string): PromptState {
  const row = repo
    .listActivePrompts(db)
    .find((entry) => entry.kind === kind && entry.name === name);
  return row
    ? { promptId: row.id, kind: row.kind, name: row.name, body: row.body, version: row.version, enabled: row.enabled === 1 }
    : { promptId: null, kind, name, body: '', version: 0, enabled: true };
}

/** Every edit appends a version, activates it and journals the previous pointer. */
export function updateChatPrompt(db: Db, update: ChatPromptUpdate): WriteResult {
  const before = current(db, update.kind, update.name);
  const after = {
    promptId: before.promptId,
    kind: update.kind,
    name: update.name,
    body: update.body,
    version: before.version + 1,
    enabled: update.enabled,
  };
  const human =
    before.promptId == null
      ? `Assistant prompt "${update.kind}/${update.name}" created (v${after.version})`
      : `Assistant prompt "${update.kind}/${update.name}" v${before.version} → v${after.version}`;
  const diff = { before, after, human };
  if (update.dryRun) return { dryRun: true, diff };

  let eventId: number | undefined;
  withTransaction(db, () => {
    const id = repo.insertPromptVersion(db, update);
    after.promptId = id;
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'chat.prompt.update',
      entity: 'chat',
      entityId: id,
      before,
      after,
    });
  });
  return { dryRun: false, diff, eventId };
}

/** Restores the active pointer recorded before the update. */
export function restoreChatPromptTx(db: Db, target: unknown): void {
  if (!target || typeof target !== 'object') return;
  const state = target as Partial<PromptState>;
  if (state.promptId != null) repo.activatePrompt(db, state.promptId);
}
