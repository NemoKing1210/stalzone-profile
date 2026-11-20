import type { ChatSettings, ChatSettingsUpdate } from '@profile/shared/contracts';
import { ChatSettingsSchema } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, type WriteResult } from '../../../platform/journal/index.js';
import * as repo from '../repo/settings.js';

function merged(current: ChatSettings, patch: ChatSettingsUpdate): ChatSettings {
  const next: ChatSettings = { ...current };
  if (patch.provider !== undefined) next.provider = patch.provider;
  if (patch.baseUrl !== undefined) next.baseUrl = patch.baseUrl;
  if (patch.model !== undefined) next.model = patch.model;
  if (patch.temperature !== undefined) next.temperature = patch.temperature;
  if (patch.maxTokens !== undefined) next.maxTokens = patch.maxTokens;
  if (patch.reasoningEffort !== undefined) next.reasoningEffort = patch.reasoningEffort;
  if (patch.timeoutMs !== undefined) next.timeoutMs = patch.timeoutMs;
  if (patch.retries !== undefined) next.retries = patch.retries;
  if (patch.readToolAllowList !== undefined) next.readToolAllowList = [...patch.readToolAllowList].sort();
  if (patch.dataScopePrices !== undefined) next.dataScopePrices = patch.dataScopePrices;
  if (patch.dataScopeLogs !== undefined) next.dataScopeLogs = patch.dataScopeLogs;
  if (patch.apiKeyEnv !== undefined) next.apiKeyEnv = patch.apiKeyEnv;
  return ChatSettingsSchema.parse({ ...next, updatedAt: current.updatedAt });
}

function human(before: ChatSettings, after: ChatSettings): string {
  const changed: string[] = [];
  for (const key of Object.keys(after) as (keyof ChatSettings)[]) {
    if (key === 'updatedAt') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.push(key);
  }
  return changed.length ? `Assistant: ${changed.join(', ')}` : 'No changes';
}

/** Settings are one audited row; a dry run returns the same diff without writing. */
export function updateChatSettings(db: Db, patch: ChatSettingsUpdate): WriteResult {
  const before = repo.toChatSettings(repo.getChatSettingsRow(db));
  const after = merged(before, patch);
  const diff = { before, after, human: human(before, after) };
  if (patch.dryRun) return { dryRun: true, diff };

  let eventId: number | undefined;
  withTransaction(db, () => {
    repo.upsertChatSettings(db, after, new Date().toISOString());
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'chat.settings.update',
      entity: 'chat',
      entityId: 1,
      before,
      after,
    });
  });
  return { dryRun: false, diff, eventId };
}

/** Restores the `chat.settings.update` before state; the caller holds the transaction. */
export function restoreChatSettingsTx(db: Db, target: unknown): void {
  if (!target || typeof target !== 'object') return;
  const settings = ChatSettingsSchema.parse(target);
  repo.upsertChatSettings(db, settings, new Date().toISOString());
}
