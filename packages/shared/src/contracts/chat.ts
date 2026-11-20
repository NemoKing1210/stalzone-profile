import { z } from 'zod';

/**
 * Assistant providers. `openai-compatible` vendors share one request shape; the others have
 * their own mapper. The key itself never lives here — only the environment variable name.
 */
export const CHAT_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'mistral',
  'openrouter',
  'ollama',
  'opencode',
  'command-code',
] as const;
export const ChatProviderSchema = z.enum(CHAT_PROVIDERS);
export type ChatProvider = z.infer<typeof ChatProviderSchema>;

export const ChatReasoningEffortSchema = z.enum(['low', 'medium', 'high']).nullable();

export const ChatSettingsSchema = z.object({
  provider: ChatProviderSchema,
  baseUrl: z.string().url().max(300).nullable(),
  model: z.string().min(1).max(120),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(256).max(32_000),
  reasoningEffort: ChatReasoningEffortSchema,
  timeoutMs: z.number().int().min(5_000).max(120_000),
  retries: z.number().int().min(0).max(5),
  /** Read tools the assistant may call; a write tool is never on this list. */
  readToolAllowList: z.array(z.string().min(1).max(80)).max(64),
  dataScopePrices: z.boolean(),
  dataScopeLogs: z.boolean(),
  /** Environment variable that holds the key; the value is never stored. */
  apiKeyEnv: z.string().min(1).max(100).nullable(),
  updatedAt: z.string().nullable(),
});
export type ChatSettings = z.infer<typeof ChatSettingsSchema>;

export const ChatSettingsUpdateSchema = ChatSettingsSchema.omit({ updatedAt: true }).partial().extend({
  dryRun: z.boolean().default(false),
});
export type ChatSettingsUpdate = z.infer<typeof ChatSettingsUpdateSchema>;

/** The read shape adds whether the configured key is present, never the key itself. */
export const ChatSettingsReadSchema = ChatSettingsSchema.extend({
  /** The env var actually consulted: the stored override or the provider default. */
  apiKeyEnvResolved: z.string().min(1).max(100),
  apiKeyConfigured: z.boolean(),
  enabled: z.boolean(),
});
export type ChatSettingsRead = z.infer<typeof ChatSettingsReadSchema>;

export const ChatTestConnectionSchema = z.object({
  provider: ChatProviderSchema.optional(),
  baseUrl: z.string().url().max(300).nullable().optional(),
  model: z.string().min(1).max(120).optional(),
  timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
});
export type ChatTestConnection = z.infer<typeof ChatTestConnectionSchema>;

export const ChatTestResultSchema = z.object({
  ok: z.boolean(),
  provider: ChatProviderSchema,
  status: z.number().int().nullable(),
  message: z.string(),
});
export type ChatTestResult = z.infer<typeof ChatTestResultSchema>;
