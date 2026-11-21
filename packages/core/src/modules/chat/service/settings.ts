import type { ChatModel, ChatModelsResult, ChatProvider, ChatSettings, ChatTestResult } from '@profile/shared/contracts';
import { WriteError } from '../../../platform/journal/index.js';
import * as repo from '../repo/settings.js';
import type { Db } from '../../../platform/db/index.js';

interface ProviderConfig {
  label: string;
  baseUrl: string | null;
  keyEnv: string;
  modelsPath: string;
  auth: 'bearer' | 'anthropic' | 'google' | 'none';
}

/**
 * Known endpoints; a provider whose base URL is not public (OpenCode, Command Code) must be
 * configured by the owner or an env variable, never guessed here.
 */
const PROVIDERS: Record<ChatProvider, ProviderConfig> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyEnv: 'NUXT_AI_OPENAI_API_KEY',
    modelsPath: '/models',
    auth: 'bearer',
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keyEnv: 'NUXT_AI_ANTHROPIC_API_KEY',
    modelsPath: '/models',
    auth: 'anthropic',
  },
  google: {
    label: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyEnv: 'NUXT_AI_GOOGLE_API_KEY',
    modelsPath: '/models',
    auth: 'google',
  },
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    keyEnv: 'NUXT_AI_MISTRAL_API_KEY',
    modelsPath: '/models',
    auth: 'bearer',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'NUXT_AI_OPENROUTER_API_KEY',
    modelsPath: '/models',
    auth: 'bearer',
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    keyEnv: 'NUXT_AI_OLLAMA_API_KEY',
    modelsPath: '/models',
    auth: 'none',
  },
  opencode: {
    label: 'OpenCode',
    baseUrl: null,
    keyEnv: 'NUXT_AI_OPENCODE_API_KEY',
    modelsPath: '/models',
    auth: 'bearer',
  },
  'command-code': {
    label: 'Command Code',
    baseUrl: null,
    keyEnv: 'NUXT_AI_COMMAND_CODE_API_KEY',
    modelsPath: '/models',
    auth: 'bearer',
  },
};

export function providerConfig(provider: ChatProvider): ProviderConfig {
  return PROVIDERS[provider];
}

function envValue(name: string | null): string | null {
  if (!name) return null;
  const value = process.env[name];
  return value && value.trim() !== '' ? value : null;
}

/** The key for the configured provider: the named env var, then the provider's default. */
export function resolveApiKey(settings: ChatSettings): { env: string; key: string | null } {
  const config = PROVIDERS[settings.provider];
  const env = settings.apiKeyEnv ?? config.keyEnv;
  return { env, key: envValue(env) ?? envValue(config.keyEnv) };
}

export function resolveBaseUrl(settings: ChatSettings): string | null {
  return settings.baseUrl ?? PROVIDERS[settings.provider].baseUrl;
}

/** Read shape: resolved values plus whether a key exists, never the key. */
export function chatSettingsRead(db: Db) {
  const settings = repo.toChatSettings(repo.getChatSettingsRow(db));
  const { env, key } = resolveApiKey(settings);
  return {
    ...settings,
    apiKeyEnv: settings.apiKeyEnv,
    apiKeyEnvResolved: env,
    apiKeyConfigured: key != null,
    enabled: key != null || settings.provider === 'ollama',
  };
}

function configuredBaseUrl(settings: ChatSettings): string {
  const base = resolveBaseUrl(settings);
  if (!base) {
    throw new WriteError(422, 'AI_NOT_CONFIGURED', `Set a base URL for ${PROVIDERS[settings.provider].label}`);
  }
  return base.replace(/\/+$/, '');
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
  const config = PROVIDERS[settings.provider];
  const base = configuredBaseUrl(settings);
  const { key } = resolveApiKey(settings);
  if (config.auth !== 'none' && !key) {
    return {
      ok: false,
      provider: settings.provider,
      status: null,
      message: `AI_NOT_CONFIGURED: set ${settings.apiKeyEnv ?? config.keyEnv}`,
    };
  }

  const url =
    config.auth === 'google'
      ? `${base}${config.modelsPath}?key=${encodeURIComponent(key ?? '')}`
      : `${base}${config.modelsPath}`;
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
  const config = PROVIDERS[settings.provider];
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

  const { key } = resolveApiKey(settings);
  if (config.auth !== 'none' && !key) {
    return {
      ok: false,
      status: null,
      message: `AI_NOT_CONFIGURED: set ${settings.apiKeyEnv ?? config.keyEnv}`,
      models: [],
    };
  }

  const url =
    config.auth === 'google'
      ? `${base}${config.modelsPath}?key=${encodeURIComponent(key ?? '')}`
      : `${base}${config.modelsPath}`;
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
