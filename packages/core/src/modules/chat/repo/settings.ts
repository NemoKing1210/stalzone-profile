import type { ChatProvider, ChatSettings } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';

export interface ChatSettingsRow {
  provider: ChatProvider;
  base_url: string | null;
  /** Stored token; never leaves the writer, the read shape and the journal exclude it. */
  api_key: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  reasoning_effort: 'low' | 'medium' | 'high' | null;
  timeout_ms: number;
  retries: number;
  read_tool_allow_list: string;
  data_scope_prices: number;
  data_scope_logs: number;
  api_key_env: string | null;
  updated_at: string;
}

/** Settings plus the stored token, which is not part of the public `ChatSettings` shape. */
export interface StoredChatSettings extends ChatSettings {
  apiKey: string | null;
}

/** The stored settings; the table is seeded by migration 0013 with one row. */
export function getChatSettingsRow(db: Db): ChatSettingsRow {
  return db.prepare(`SELECT * FROM chat_settings WHERE id = 1`).get() as ChatSettingsRow;
}

export function toChatSettings(row: ChatSettingsRow): StoredChatSettings {
  let tools: string[] = [];
  try {
    const parsed = JSON.parse(row.read_tool_allow_list) as unknown;
    if (Array.isArray(parsed)) tools = parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    /* a broken list means no tools, not a crash */
  }
  return {
    provider: row.provider,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    reasoningEffort: row.reasoning_effort,
    timeoutMs: row.timeout_ms,
    retries: row.retries,
    readToolAllowList: tools,
    dataScopePrices: row.data_scope_prices === 1,
    dataScopeLogs: row.data_scope_logs === 1,
    apiKeyEnv: row.api_key_env,
    updatedAt: row.updated_at,
  };
}

export function upsertChatSettings(db: Db, settings: StoredChatSettings, updatedAt: string): void {
  db.prepare(
    `UPDATE chat_settings SET
       provider = @provider, base_url = @base_url, api_key = @api_key, model = @model,
       temperature = @temperature, max_tokens = @max_tokens,
       reasoning_effort = @reasoning_effort, timeout_ms = @timeout_ms,
       retries = @retries, read_tool_allow_list = @read_tool_allow_list,
       data_scope_prices = @data_scope_prices, data_scope_logs = @data_scope_logs,
       api_key_env = @api_key_env, updated_at = @updated_at
     WHERE id = 1`,
  ).run({
    provider: settings.provider,
    base_url: settings.baseUrl,
    api_key: settings.apiKey,
    model: settings.model,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    reasoning_effort: settings.reasoningEffort,
    timeout_ms: settings.timeoutMs,
    retries: settings.retries,
    read_tool_allow_list: JSON.stringify(settings.readToolAllowList),
    data_scope_prices: settings.dataScopePrices ? 1 : 0,
    data_scope_logs: settings.dataScopeLogs ? 1 : 0,
    api_key_env: settings.apiKeyEnv,
    updated_at: updatedAt,
  });
}
