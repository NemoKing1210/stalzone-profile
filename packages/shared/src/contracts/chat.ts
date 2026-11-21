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
  'opencode-go',
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
    label: 'OpenCode Zen',
    // Console pay-as-you-go; the Go plan has its own base below.
    defaultBaseUrl: 'https://opencode.ai/inference/openai/v1',
    defaultModel: 'deepseek-v4.1-flash',
    keyEnv: 'NUXT_AI_OPENCODE_API_KEY',
    docsUrl: 'https://opencode.ai/docs/console/harnesses',
  },
  'opencode-go': {
    label: 'OpenCode Go',
    // The same Console key, served from the Go subscription base.
    defaultBaseUrl: 'https://opencode.ai/inference/go/openai/v1',
    defaultModel: 'deepseek-v4.1-flash',
    keyEnv: 'NUXT_AI_OPENCODE_API_KEY',
    docsUrl: 'https://opencode.ai/docs/console/go',
  },
  'command-code': {
    label: 'Command Code',
    defaultBaseUrl: 'https://api.commandcode.ai/provider/v1',
    defaultModel: 'deepseek/deepseek-v4-flash',
    keyEnv: 'NUXT_AI_COMMAND_CODE_API_KEY',
    docsUrl: 'https://commandcode.ai/docs/provider',
  },
};

/**
 * An uppercase environment variable name; the key's value is never stored or returned.
 * Uppercase is what separates a name from a provider key such as `oc_sk_…`, which is
 * otherwise identifier-shaped.
 */
export const CHAT_ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/;
export const ChatEnvVarNameSchema = z
  .string()
  .max(100)
  .regex(CHAT_ENV_VAR_NAME, 'Use an uppercase variable name, not the key itself');

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
  apiKeyEnv: ChatEnvVarNameSchema.nullable(),
  updatedAt: z.string().nullable(),
});
export type ChatSettings = z.infer<typeof ChatSettingsSchema>;

export const ChatSettingsUpdateSchema = ChatSettingsSchema.omit({ updatedAt: true }).partial().extend({
  /** Write-only token; `null` clears it. It is never returned or written to the journal. */
  apiKey: z.string().min(1).max(5_000).nullable().optional(),
  dryRun: z.boolean().default(false),
});
export type ChatSettingsUpdate = z.infer<typeof ChatSettingsUpdateSchema>;

/** The read shape adds whether a key is present, never the key itself. */
export const ChatSettingsReadSchema = ChatSettingsSchema.extend({
  /** The env var consulted when no token is stored: the override or the provider default. */
  apiKeyEnvResolved: z.string().min(1).max(100),
  apiKeyConfigured: z.boolean(),
  /** Where the effective key came from: the profile row, the environment, or nowhere. */
  apiKeySource: z.enum(['stored', 'env', 'none']),
  enabled: z.boolean(),
});
export type ChatSettingsRead = z.infer<typeof ChatSettingsReadSchema>;

export const ChatTestConnectionSchema = z.object({
  provider: ChatProviderSchema.optional(),
  baseUrl: z.string().url().max(300).nullable().optional(),
  /** An unsaved token from the form; it is used for this request and never stored. */
  apiKey: z.string().min(1).max(5_000).nullable().optional(),
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
  apiKeyEnv: ChatEnvVarNameSchema.nullable().optional(),
  /** An unsaved token from the form; it is used for this request and never stored. */
  apiKey: z.string().min(1).max(5_000).nullable().optional(),
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

/**
 * Files the owner attaches to one assistant message. The bytes travel base64 inside the turn
 * (one atomic write), are stored in `chat_attachment` and never enter `event_log`.
 */
export const CHAT_ATTACHMENT_LIMITS = {
  files: 4,
  fileBytes: 4 * 1024 * 1024,
  totalBytes: 6 * 1024 * 1024,
  /** Characters of a text file inlined into the prompt; the rest is marked truncated. */
  textChars: 24_000,
} as const;

export type ChatFileKind = 'image' | 'text';

const IMAGE_MIME_TYPES: Record<string, true> = {
  'image/png': true,
  'image/jpeg': true,
  'image/webp': true,
  'image/gif': true,
};

const TEXT_MIME_TYPES: Record<string, true> = {
  'application/json': true,
  'application/ld+json': true,
  'application/x-ndjson': true,
  'application/xml': true,
  'application/xhtml+xml': true,
  'application/yaml': true,
  'application/x-yaml': true,
  'application/toml': true,
  'application/javascript': true,
  'application/typescript': true,
  'application/sql': true,
  'application/csv': true,
};

/** Browsers report many notes and source files as empty or `application/octet-stream`. */
const TEXT_EXTENSIONS: Record<string, true> = {
  txt: true,
  text: true,
  md: true,
  markdown: true,
  mdx: true,
  log: true,
  csv: true,
  tsv: true,
  json: true,
  jsonc: true,
  yaml: true,
  yml: true,
  toml: true,
  ini: true,
  cfg: true,
  conf: true,
  xml: true,
  html: true,
  htm: true,
  css: true,
  scss: true,
  js: true,
  mjs: true,
  cjs: true,
  ts: true,
  tsx: true,
  jsx: true,
  vue: true,
  sql: true,
  sh: true,
  ps1: true,
  py: true,
  rs: true,
  go: true,
  java: true,
  c: true,
  h: true,
  cpp: true,
  hpp: true,
};

/**
 * How the model receives the file: an image part, or text inlined into the transcript.
 * `null` means the assistant cannot send it, so the API refuses the turn.
 */
export function chatFileKind(name: string, mimeType: string): ChatFileKind | null {
  const mime = mimeType.toLowerCase().split(';')[0]!.trim();
  if (Object.hasOwn(IMAGE_MIME_TYPES, mime)) return 'image';
  if (mime.startsWith('text/') || Object.hasOwn(TEXT_MIME_TYPES, mime)) return 'text';
  const extension = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase();
  if (extension && (mime === '' || mime === 'application/octet-stream')) {
    if (Object.hasOwn(IMAGE_EXTENSIONS, extension)) return 'image';
    if (Object.hasOwn(TEXT_EXTENSIONS, extension)) return 'text';
  }
  return null;
}

/** Decoded byte count of a base64 payload, without allocating the buffer. */
export function chatBase64Bytes(data: string): number {
  const clean = data.replace(/\s+/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

/** A declared file the inspector cannot trust; the API maps these to 422 codes. */
export type ChatFileProblem = 'unsupported' | 'type-mismatch' | 'not-text';

export interface ChatFileInspection {
  kind: ChatFileKind;
  /** Canonical type used for storage and serving, whatever the browser declared. */
  mimeType: string;
}

const IMAGE_EXTENSIONS: Record<string, true> = {
  png: true,
  jpg: true,
  jpeg: true,
  webp: true,
  gif: true,
};

/** Magic-byte sniffing is the only trusted source of an image type. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const at = (offset: number, signature: number[]): boolean =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (at(0, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return 'image/gif';
  }
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return null;
}

/**
 * Validates the bytes, not the browser's label: an image must match its magic bytes, and a
 * text file must decode as UTF-8 without NUL bytes. Returns the canonical stored type.
 */
export function inspectChatFile(
  name: string,
  mimeType: string,
  bytes: Uint8Array,
): ChatFileInspection | { problem: ChatFileProblem } {
  const kind = chatFileKind(name, mimeType);
  if (!kind) return { problem: 'unsupported' };

  if (kind === 'image') {
    const declared = mimeType.toLowerCase().split(';')[0]!.trim();
    const canonical = declared === 'image/jpg' ? 'image/jpeg' : declared;
    const sniffed = sniffImageMime(bytes);
    if (!sniffed || (canonical.startsWith('image/') && canonical !== sniffed)) {
      return { problem: 'type-mismatch' };
    }
    return { kind, mimeType: sniffed };
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (decoded.includes('\u0000')) return { problem: 'not-text' };
  } catch {
    return { problem: 'not-text' };
  }
  return { kind, mimeType: 'text/plain; charset=utf-8' };
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** One attached file on the way in; `data` is base64, never a path on the server. */
export const ChatAttachmentInputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (name) =>
          !name.includes('/') &&
          !name.includes('\\') &&
          ![...name].some((character) => character.charCodeAt(0) < 32),
        'file name must be a basename without control characters',
      ),
    mimeType: z.string().max(120),
    data: z.string().min(1).regex(BASE64_PATTERN, 'data must be base64'),
  })
  .superRefine((file, ctx) => {
    if (!chatFileKind(file.name, file.mimeType)) {
      ctx.addIssue({ code: 'custom', path: ['mimeType'], message: 'UNSUPPORTED_FILE_TYPE' });
    }
    if (chatBase64Bytes(file.data) > CHAT_ATTACHMENT_LIMITS.fileBytes) {
      ctx.addIssue({ code: 'custom', path: ['data'], message: 'FILE_TOO_LARGE' });
    }
  });
export type ChatAttachmentInput = z.infer<typeof ChatAttachmentInputSchema>;

/** The read shape carries metadata only; bytes come from the attachment route. */
export const ChatAttachmentSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(200),
  mimeType: z.string().max(120),
  size: z.number().int().min(0),
  createdAt: z.string(),
});
export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;

export const ChatThreadSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1).max(200),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatThread = z.infer<typeof ChatThreadSchema>;

/**
 * Provider facts about one assistant message, kept only when the provider returned them:
 * the model id, the time to first full reply in milliseconds, and the provider's own token
 * usage. Nothing here is computed or back-filled; a missing value stays `null`.
 */
export const ChatMessageMetaSchema = z.object({
  model: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  usage: z.record(z.string(), z.number()).optional(),
});
export type ChatMessageMeta = z.infer<typeof ChatMessageMetaSchema>;

export const ChatMessageSchema = z.object({
  id: z.number().int(),
  threadId: z.number().int(),
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string(),
  toolName: z.string().nullable(),
  toolCallId: z.string().nullable(),
  /** Structured tool result the page can render with the site's components. */
  payload: z.unknown().nullable(),
  /** Reasoning the provider returned for this answer; never synthesized, never re-sent. */
  reasoning: z.string().nullable().default(null),
  /** Model, duration and token usage of the assistant round, when the provider reported them. */
  meta: ChatMessageMetaSchema.nullable().default(null),
  /** Files the owner attached to this message; metadata only, bytes are served separately. */
  attachments: z.array(ChatAttachmentSchema).default([]),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatThreadReadSchema = z.object({
  thread: ChatThreadSchema,
  messages: z.array(ChatMessageSchema),
});
export type ChatThreadRead = z.infer<typeof ChatThreadReadSchema>;

export const ChatSendSchema = z
  .object({
    threadId: z.number().int().positive().optional(),
    title: z.string().min(1).max(200).optional(),
    message: z.string().max(8_000).default(''),
    /** The files travel with the turn; an empty message is valid when at least one is attached. */
    files: z.array(ChatAttachmentInputSchema).max(CHAT_ATTACHMENT_LIMITS.files).optional(),
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
  })
  .superRefine((turn, ctx) => {
    if (!turn.message.trim() && !turn.files?.length) {
      ctx.addIssue({ code: 'custom', path: ['message'], message: 'EMPTY_TURN' });
    }
    const total = (turn.files ?? []).reduce((sum, file) => sum + chatBase64Bytes(file.data), 0);
    if (total > CHAT_ATTACHMENT_LIMITS.totalBytes) {
      ctx.addIssue({ code: 'custom', path: ['files'], message: 'FILES_TOO_LARGE' });
    }
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

/**
 * One SSE frame of a streamed turn. `meta` opens the conversation (thread + the user message
 * already stored), `delta` carries provider text or reasoning as it arrives, `tool` reports a
 * call starting and finishing, `pending` raises the write confirmation, and `done` is the only
 * terminal frame — it carries the canonical message list and any failure, so a client never
 * has to reconcile two endings.
 */
export const ChatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('meta'), thread: ChatThreadSchema, message: ChatMessageSchema }),
  z.object({ type: z.literal('delta'), kind: z.enum(['text', 'reasoning']), text: z.string() }),
  z.object({
    type: z.literal('tool'),
    callId: z.string(),
    name: z.string(),
    phase: z.enum(['start', 'done', 'declined']),
    payload: z.unknown().optional(),
  }),
  z.object({ type: z.literal('pending'), pending: ChatPendingWriteSchema }),
  z.object({
    type: z.literal('done'),
    thread: ChatThreadSchema,
    messages: z.array(ChatMessageSchema),
    pending: ChatPendingWriteSchema.nullable(),
    error: z.string().nullable(),
  }),
  /** A failure before a turn exists (missing thread, rejected attachment); no `done` follows. */
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;
