import type { ChatModel, ChatModelsResult, ChatProvider, ChatSettings, ChatTestResult } from '@profile/shared/contracts';
import { CHAT_ENV_VAR_NAME, CHAT_PROVIDER_META } from '@profile/shared/contracts';
import { WriteError } from '../../../platform/journal/index.js';
import * as repo from '../repo/settings.js';
import type { Db } from '../../../platform/db/index.js';

interface ProviderConfig {
  label: string;
  /** Documented default endpoint; a stored base URL overrides it. */
  baseUrl: string | null;
  keyEnv: string;
  auth: 'bearer' | 'anthropic' | 'google' | 'none';
}

/** How each provider authenticates its model list and chat request. */
const AUTH: Record<ChatProvider, ProviderConfig['auth']> = {
  openai: 'bearer',
  anthropic: 'anthropic',
  google: 'google',
  mistral: 'bearer',
  openrouter: 'bearer',
  ollama: 'none',
  opencode: 'bearer',
  'command-code': 'bearer',
};

/** The endpoint, label and key variable come from the shared provider catalog. */
export function providerConfig(provider: ChatProvider): ProviderConfig {
  const meta = CHAT_PROVIDER_META[provider];
  return { label: meta.label, baseUrl: meta.defaultBaseUrl, keyEnv: meta.keyEnv, auth: AUTH[provider] };
}

/** A stored override is usable only when it is a variable name, never a pasted key. */
export function isEnvVarName(value: string | null | undefined): value is string {
  return typeof value === 'string' && CHAT_ENV_VAR_NAME.test(value);
}

function envValue(name: string | null): string | null {
  if (!name) return null;
  const value = process.env[name];
  return value && value.trim() !== '' ? value : null;
}

/** The key for the configured provider: the named env var, then the provider's default. */
export function resolveApiKey(settings: ChatSettings): { env: string; key: string | null } {
  const config = providerConfig(settings.provider);
  const env = isEnvVarName(settings.apiKeyEnv) ? settings.apiKeyEnv : config.keyEnv;
  return { env, key: envValue(env) ?? envValue(config.keyEnv) };
}

export function resolveBaseUrl(settings: ChatSettings): string | null {
  return settings.baseUrl ?? providerConfig(settings.provider).baseUrl;
}

/** Read shape: resolved values plus whether a key exists, never the key. */
export function chatSettingsRead(db: Db) {
  const settings = repo.toChatSettings(repo.getChatSettingsRow(db));
  const { env, key } = resolveApiKey(settings);
  const apiKeyEnvInvalid = settings.apiKeyEnv != null && !isEnvVarName(settings.apiKeyEnv);
  return {
    ...settings,
    // A pasted key is never echoed back; the owner sees the flag and sets a variable name.
    apiKeyEnv: apiKeyEnvInvalid ? null : settings.apiKeyEnv,
    apiKeyEnvInvalid,
    apiKeyEnvResolved: env,
    apiKeyConfigured: key != null,
    enabled: key != null || settings.provider === 'ollama',
  };
}

function configuredBaseUrl(settings: ChatSettings): string {
  const base = resolveBaseUrl(settings);
  if (!base) {
    throw new WriteError(422, 'AI_NOT_CONFIGURED', `Set a base URL for ${providerConfig(settings.provider).label}`);
  }
  return base.replace(/\/+$/, '');
}

/**
 * Model list endpoint. OpenCode Console publishes its catalog at `/inference/v1/models`,
 * beside the OpenAI-compatible base rather than under it; every other provider serves
 * `<base>/models`.
 */
function modelsUrl(provider: ChatProvider, base: string): string {
  if (provider === 'opencode') return `${base.replace(/\/openai\/v1$/, '/v1').replace(/\/+$/, '')}/models`;
  return `${base}/models`;
}

interface TestOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** One GET against the provider's model list; no chat message is sent or stored. */
export async function testChatConnection(
  db: Db,
  overrides: { provider?: ChatProvider; baseUrl?: string | null; model?: string; timeoutMs?: number },
  options: TestOptions = {},
): Promise<ChatTestResult> {
  const stored = repo.toChatSettings(repo.getChatSettingsRow(db));
  const settings: ChatSettings = {
    ...stored,
    ...(overrides.provider ? { provider: overrides.provider } : {}),
    ...(overrides.baseUrl !== undefined ? { baseUrl: overrides.baseUrl } : {}),
    ...(overrides.model ? { model: overrides.model } : {}),
    ...(overrides.timeoutMs ? { timeoutMs: overrides.timeoutMs } : {}),
  };
  const config = providerConfig(settings.provider);
  const base = configuredBaseUrl(settings);
  const { env, key } = resolveApiKey(settings);
  if (config.auth !== 'none' && !key) {
    return {
      ok: false,
      provider: settings.provider,
      status: null,
      message: `AI_NOT_CONFIGURED: set ${env}`,
    };
  }

  const models = modelsUrl(settings.provider, base);
  const url = config.auth === 'google' ? `${models}?key=${encodeURIComponent(key ?? '')}` : models;
  const headers: Record<string, string> = {};
  if (config.auth === 'bearer') headers.authorization = `Bearer ${key}`;
  if (config.auth === 'anthropic') {
    headers['x-api-key'] = key ?? '';
    headers['anthropic-version'] = '2023-06-01';
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  const signal = options.signal ?? controller.signal;
  try {
    const response = await fetchImpl(url, { method: 'GET', headers, signal });
    return {
      ok: response.ok,
      provider: settings.provider,
      status: response.status,
      message: response.ok ? `${config.label}: connected` : `${config.label}: HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      provider: settings.provider,
      status: null,
      message: error instanceof Error ? error.message : 'connection failed',
    };
  } finally {
    clearTimeout(timer);
  }
}


interface ModelsOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** Reads id/display name out of the three documented model-list shapes, without inventing entries. */
function parseModels(provider: ChatProvider, body: unknown): ChatModel[] {
  if (!body || typeof body !== 'object') return [];
  const record = body as Record<string, unknown>;
  const models: ChatModel[] = [];
  const seen = new Set<string>();

  if (provider === 'google') {
    const entries = Array.isArray(record.models) ? record.models : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const model = entry as Record<string, unknown>;
      const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
      if (!methods.includes('generateContent')) continue;
      const raw = typeof model.name === 'string' ? model.name : '';
      const id = raw.replace(/^models\//, '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const label = typeof model.displayName === 'string' && model.displayName.trim() ? model.displayName : null;
      models.push({ id, label });
    }
    return models.sort((left, right) => left.id.localeCompare(right.id)).slice(0, 500);
  }

  const entries = Array.isArray(record.data) ? record.data : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const model = entry as Record<string, unknown>;
    const id = typeof model.id === 'string' ? model.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const rawLabel = model.display_name ?? model.displayName;
    const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel : null;
    models.push({ id, label });
    if (models.length >= 500) break;
  }
  return models;
}

/**
 * The provider's model list for the settings picker. A read: it never writes the DB, an
 * event or the key, and the key comes only from the named environment variable.
 */
export async function listChatModels(
  db: Db,
  overrides: { provider?: ChatProvider; baseUrl?: string | null; apiKeyEnv?: string | null; timeoutMs?: number },
  options: ModelsOptions = {},
): Promise<ChatModelsResult> {
  const stored = repo.toChatSettings(repo.getChatSettingsRow(db));
  const settings: ChatSettings = {
    ...stored,
    ...(overrides.provider ? { provider: overrides.provider } : {}),
    ...(overrides.baseUrl !== undefined ? { baseUrl: overrides.baseUrl } : {}),
    ...(overrides.apiKeyEnv !== undefined ? { apiKeyEnv: overrides.apiKeyEnv } : {}),
    ...(overrides.timeoutMs ? { timeoutMs: overrides.timeoutMs } : {}),
  };
  const config = providerConfig(settings.provider);
  let base: string;
  try {
    base = configuredBaseUrl(settings);
  } catch (error) {
    return {
      ok: false,
      status: null,
      message: error instanceof WriteError ? error.message : 'Set the provider base URL',
      models: [],
    };
  }

  const { env, key } = resolveApiKey(settings);
  if (config.auth !== 'none' && !key) {
    return {
      ok: false,
      status: null,
      message: `AI_NOT_CONFIGURED: set ${env}`,
      models: [],
    };
  }

  const models = modelsUrl(settings.provider, base);
  const url = config.auth === 'google' ? `${models}?key=${encodeURIComponent(key ?? '')}` : models;
  const headers: Record<string, string> = {};
  if (config.auth === 'bearer') headers.authorization = `Bearer ${key}`;
  if (config.auth === 'anthropic') {
    headers['x-api-key'] = key ?? '';
    headers['anthropic-version'] = '2023-06-01';
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  const signal = options.signal ?? controller.signal;
  try {
    const response = await fetchImpl(url, { method: 'GET', headers, signal });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `${config.label}: HTTP ${response.status}`,
        models: [],
      };
    }
    const body: unknown = await response.json();
    return { ok: true, status: response.status, message: `${config.label}: connected`, models: parseModels(settings.provider, body) };
  } catch (error) {
    return {
      ok: false,
      status: null,
      message: error instanceof Error ? error.message : 'connection failed',
      models: [],
    };
  } finally {
    clearTimeout(timer);
  }
}
