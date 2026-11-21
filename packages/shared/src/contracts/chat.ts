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

/** Public facts about one provider: endpoint, model, key variable and docs. No secret. */
export interface ChatProviderMeta {
  label: string;
  /** The documented public endpoint; null only when the provider has no fixed URL. */
  defaultBaseUrl: string | null;
  /** Model pre-filled when the owner switches to this provider. */
  defaultModel: string;
  /** The env variable consulted when the stored override is empty. */
  keyEnv: string;
  docsUrl: string;
}

/**
 * Provider endpoints verified against the vendors' documentation. The server resolves a
 * stored `baseUrl: null` to `defaultBaseUrl`; the settings UI shows the same value as the
 * effective endpoint, so a plain provider choice needs no URL typed by hand.
 */
export const CHAT_PROVIDER_META: Record<ChatProvider, ChatProviderMeta> = {
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    keyEnv: 'NUXT_AI_OPENAI_API_KEY',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
  },
  anthropic: {
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-6',
    keyEnv: 'NUXT_AI_ANTHROPIC_API_KEY',
    docsUrl: 'https://platform.claude.com/docs/en/api/overview',
  },
  google: {
    label: 'Google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    keyEnv: 'NUXT_AI_GOOGLE_API_KEY',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
  },
  mistral: {
    label: 'Mistral',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    keyEnv: 'NUXT_AI_MISTRAL_API_KEY',
    docsUrl: 'https://docs.mistral.ai/api/',
  },
  openrouter: {
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4.1-mini',
    keyEnv: 'NUXT_AI_OPENROUTER_API_KEY',
    docsUrl: 'https://openrouter.ai/docs/api-reference/overview',
  },
  ollama: {
    label: 'Ollama (local)',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    keyEnv: 'NUXT_AI_OLLAMA_API_KEY',
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
  },
  opencode: {
    label: 'OpenCode',
    // Console's OpenAI-compatible base; the pay-as-you-go and Go plans differ, see docs.
    defaultBaseUrl: 'https://opencode.ai/inference/openai/v1',
    defaultModel: 'deepseek-v4.1-flash',
    keyEnv: 'NUXT_AI_OPENCODE_API_KEY',
    docsUrl: 'https://opencode.ai/docs/console/harnesses',
  },
  'command-code': {
    label: 'Command Code',
    defaultBaseUrl: 'https://api.commandcode.ai/provider/v1',
    defaultModel: 'deepseek/deepseek-v4-flash',
    keyEnv: 'NUXT_AI_COMMAND_CODE_API_KEY',
    docsUrl: 'https://commandcode.ai/docs/provider',
  },
};

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

export const ChatModelsRequestSchema = z.object({
  provider: ChatProviderSchema.optional(),
  baseUrl: z.string().url().max(300).nullable().optional(),
  /** An env variable name the form names but has not saved yet. */
  apiKeyEnv: z.string().min(1).max(100).nullable().optional(),
  timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
});
export type ChatModelsRequest = z.infer<typeof ChatModelsRequestSchema>;

export const ChatModelSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(200).nullable(),
});
export type ChatModel = z.infer<typeof ChatModelSchema>;

export const ChatModelsResultSchema = z.object({
  ok: z.boolean(),
  status: z.number().int().nullable(),
  message: z.string(),
  models: z.array(ChatModelSchema),
});
export type ChatModelsResult = z.infer<typeof ChatModelsResultSchema>;

export const ChatPromptKindSchema = z.enum(['system', 'skill']);

export const ChatPromptSchema = z.object({
  promptId: z.number().int(),
  kind: ChatPromptKindSchema,
  name: z.string().min(1).max(80),
  body: z.string().min(1).max(20_000),
  version: z.number().int().min(1),
  enabled: z.boolean(),
});
export type ChatPrompt = z.infer<typeof ChatPromptSchema>;

export const ChatPromptReadSchema = z.object({
  prompts: z.array(ChatPromptSchema),
  composed: z.string(),
});
export type ChatPromptRead = z.infer<typeof ChatPromptReadSchema>;

export const ChatPromptUpdateSchema = z.object({
  kind: ChatPromptKindSchema,
  name: z.string().min(1).max(80),
  body: z.string().min(1).max(20_000),
  enabled: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});
export type ChatPromptUpdate = z.infer<typeof ChatPromptUpdateSchema>;

export const ChatThreadSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1).max(200),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatThread = z.infer<typeof ChatThreadSchema>;

export const ChatMessageSchema = z.object({
  id: z.number().int(),
  threadId: z.number().int(),
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string(),
  toolName: z.string().nullable(),
  toolCallId: z.string().nullable(),
  /** Structured tool result the page can render with the site's components. */
  payload: z.unknown().nullable(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatThreadReadSchema = z.object({
  thread: ChatThreadSchema,
  messages: z.array(ChatMessageSchema),
});
export type ChatThreadRead = z.infer<typeof ChatThreadReadSchema>;

export const ChatSendSchema = z.object({
  threadId: z.number().int().positive().optional(),
  title: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(8_000),
  /** A write the model proposed and the owner confirmed in a previous turn. */
  confirm: z
    .object({
      toolName: z.string().min(1).max(80),
      args: z.record(z.string(), z.unknown()),
    })
    .optional(),
  /** A write the owner declined. */
  decline: z
    .object({
      toolName: z.string().min(1).max(80),
    })
    .optional(),
});
export type ChatSend = z.infer<typeof ChatSendSchema>;

export const ChatPendingWriteSchema = z.object({
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
  human: z.string(),
  diff: z.unknown(),
});
export type ChatPendingWrite = z.infer<typeof ChatPendingWriteSchema>;

export const ChatTurnResultSchema = z.object({
  thread: ChatThreadSchema,
  messages: z.array(ChatMessageSchema),
  pending: ChatPendingWriteSchema.nullable(),
  error: z.string().nullable(),
});
export type ChatTurnResult = z.infer<typeof ChatTurnResultSchema>;
