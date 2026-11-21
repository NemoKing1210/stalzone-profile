import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CHAT_ATTACHMENT_LIMITS,
  chatFileKind,
  type ChatItemRef,
  type ChatPin,
  type ChatSend,
  type ChatSettings,
  type ChatStreamEvent,
  type ChatTurnResult,
} from '@profile/shared/contracts';
import {
  appendChatMessage,
  chatItemContext,
  composeChatPrompt,
  createChatThread,
  currentEventContext,
  dedupeChatRefs,
  deleteChatMessagesAfter,
  extractChatRefs,
  getChatMessageRefs,
  getChatMessageRow,
  getChatSettingsRow,
  getChatThread,
  getLogger,
  listChatAttachmentData,
  listChatMessages,
  listChatThreads,
  mentionRefsFromText,
  prepareChatAttachment,
  readChatPins,
  resolveApiKey,
  resolveBaseUrl,
  resolveChatRefs,
  setChatMessageError,
  toChatSettings,
  type ChatAttachmentData,
  type Db,
} from '@profile/core';
import { localClient, type ProfileClient } from './client.js';
import { createProfileServer, isWriteTool, toolDefinitions, writeLimiter } from './registry.js';

type Json = Record<string, unknown>;
type FetchLike = typeof fetch;

interface ToolCall {
  id: string;
  name: string;
  args: Json;
}

interface ProviderReply {
  text: string;
  /** Reasoning the provider returned for this round; empty when it sent none. */
  reasoning: string;
  calls: ToolCall[];
}

interface ProviderResult {
  reply: ProviderReply;
  /** Provider-specific continuation state (OpenAI messages, Anthropic blocks, Google contents). */
  state: unknown;
  /** Provider-reported token counts, normalized to input/output/total; absent when not sent. */
  usage?: Record<string, number>;
}

export interface ChatTurnOptions {
  fetchImpl?: FetchLike;
  maxRounds?: number;
  client?: ProfileClient;
  /** Aborting this closes the provider request; nothing of the in-flight answer is stored. */
  signal?: AbortSignal;
  /** When present the turn streams: provider deltas, tool phases and the final frame. */
  onEvent?: (event: ChatStreamEvent) => void;
}

type OpenAiContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | OpenAiContentPart[];
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface ProviderImage {
  mimeType: string;
  /** Base64 bytes, no data-URL prefix. */
  data: string;
}

interface ProviderInput {
  system: string;
  transcript: string;
  images: ProviderImage[];
  definitions: { name: string; description: string; parameters: Record<string, unknown> }[];
  state: unknown;
  temperature: number;
  maxTokens: number;
  reasoningEffort: 'low' | 'medium' | 'high' | null;
  timeoutMs: number;
  /** Ask the provider for an SSE body and report each fragment as it arrives. */
  stream: boolean;
  onDelta?: (kind: 'text' | 'reasoning', text: string) => void;
  signal?: AbortSignal;
}

/** One executed tool call, kept for the provider's continuation message. */
interface ToolRun {
  id: string;
  name: string;
  content: string;
  payload: unknown;
}

/** Text files are inlined; the cap keeps one large note from crowding out the conversation. */
function fileBlock(name: string, data: Buffer): string {
  const text = data.toString('utf8');
  const clipped =
    text.length > CHAT_ATTACHMENT_LIMITS.textChars
      ? `${text.slice(0, CHAT_ATTACHMENT_LIMITS.textChars)}\n…[truncated]`
      : text;
  return `\n\n[Attached file: ${name}]\n${clipped}\n[/Attached file]`;
}

function transcriptFor(db: Db, threadId: number, files: ChatAttachmentData[]): string {
  const byMessage = new Map<number, ChatAttachmentData[]>();
  for (const file of files) {
    const list = byMessage.get(file.messageId) ?? [];
    list.push(file);
    byMessage.set(file.messageId, list);
  }
  return listChatMessages(db, threadId)
    .map((message) => {
      const label = message.role === 'tool' ? `tool ${message.toolName ?? ''}` : message.role;
      const blocks = (byMessage.get(message.id) ?? [])
        .filter((file) => chatFileKind(file.name, file.mimeType) === 'text')
        .map((file) => fileBlock(file.name, file.data))
        .join('');
      return `${label}: ${transcriptText(message.content)}${blocks}`;
    })
    .join('\n');
}

function safeJson(text: string): Json {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return {};
  }
}

/** Fullwidth bars are what DeepSeek emits; ASCII bars are accepted too. */
const DSML_MARKER = /\|\s*DSML\s*\|/i;
const DSML_BLOCK = /<\s*\|DSML\|\s*calls\s*>([\s\S]*?)<\/\s*\|DSML\|\s*calls\s*>/i;
const DSML_INVOKE = /<\s*\|DSML\|\s*invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/\s*\|DSML\|\s*invoke\s*>/gi;
const DSML_PARAM =
  /<\s*\|DSML\|\s*parameter\s+name="([^"]+)"(?:\s+string="([^"]+)")?\s*>([\s\S]*?)<\/\s*\|DSML\|\s*parameter\s*>/gi;

function decodeDsmlValue(value: string): string {
  const codePoint = (raw: string, radix: number): string => {
    const code = Number.parseInt(raw, radix);
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(hex, 16))
    .replace(/&#(\d+);/g, (_, decimal: string) => codePoint(decimal, 10))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function dsmlValue(raw: string): unknown {
  const value = decodeDsmlValue(raw).trim();
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** Keeps already-stored leaked markup out of the next prompt. */
function transcriptText(text: string): string {
  return DSML_MARKER.test(text.replaceAll('\uff5c', '|')) ? stripDsmlMarkup(text) : text;
}

/** Removes every tool-call block and a truncated tail so no markup reaches the UI. */
function stripDsmlMarkup(text: string): string {
  const normalized = text.replaceAll('\uff5c', '|');
  return normalized
    .replace(/<\s*\|DSML\|\s*calls\s*>[\s\S]*?<\/\s*\|DSML\|\s*calls\s*>/gi, '')
    .replace(/<\s*\|DSML\|[\s\S]*$/i, '')
    .trim();
}

/**
 * Some OpenAI-compatible gateways return DeepSeek's native tool-call markup as ordinary
 * text instead of `tool_calls`. Recover the calls so they still run, and strip the markup
 * from the prose so the answer never shows it.
 */
function parseDsmlReply(text: string, allowed: ReadonlySet<string>): { text: string; calls: ToolCall[] } | null {
  const normalized = text.replaceAll('\uff5c', '|');
  if (!DSML_MARKER.test(normalized)) return null;
  const calls: ToolCall[] = [];
  const block = DSML_BLOCK.exec(normalized);
  if (block) {
    for (const invoke of (block[1] ?? '').matchAll(DSML_INVOKE)) {
      const name = invoke[1] ?? '';
      if (!allowed.has(name)) continue;
      const args: Json = {};
      for (const param of (invoke[2] ?? '').matchAll(DSML_PARAM)) {
        const key = param[1] ?? '';
        if (!key || key.startsWith('__')) continue;
        args[key] = param[2] === 'true' ? decodeDsmlValue(param[3] ?? '') : dsmlValue(param[3] ?? '');
      }
      calls.push({ id: `dsml_${crypto.randomUUID()}`, name, args });
    }
  }
  return { text: stripDsmlMarkup(text), calls };
}

/**
 * OpenCode Console routes a conversation by `x-opencode-session` and the Go plan refuses a
 * request without it. Derive a stable opaque id per thread so a retry reuses its route.
 */
function providerSession(thread: { id: number; createdAt: string }): string {
  return `ses_${createHash('sha256').update(`${thread.id}:${thread.createdAt}`).digest('hex').slice(0, 32)}`;
}

/** Explicit refs first, then hand-typed tokens the turn can resolve exactly. */
function turnRefs(db: Db, input: ChatSend, pins: readonly ChatPin[]): ChatItemRef[] {
  const explicit = resolveChatRefs(db, input.refs ?? [], input.message);
  const known = new Set([...pins.map((pin) => pin.token), ...explicit.map((ref) => ref.token)]);
  return dedupeChatRefs([...explicit, ...mentionRefsFromText(db, input.message, known)]);
}

/**
 * One assistant turn: compose the active prompt, call the provider, run read tools freely and
 * pause on the first write with its dry-run diff. Nothing here writes profile data directly;
 * writes go through the MCP registry (and therefore the owning service and the journal).
 */
export async function runChatTurn(db: Db, input: ChatSend, options: ChatTurnOptions = {}): Promise<ChatTurnResult> {
  const settings = toChatSettings(getChatSettingsRow(db));
  const base = resolveBaseUrl(settings);
  const { key, env } = resolveApiKey(settings);
  const emit = options.onEvent ?? (() => {});
  const finish = (result: ChatTurnResult): ChatTurnResult => {
    emit({
      type: 'done',
      thread: result.thread,
      messages: result.messages,
      pending: result.pending,
      error: result.error,
    });
    return result;
  };
  const requestId = currentEventContext()?.requestId ?? null;
  const turnLogger = getLogger(db, 'app', { source: 'server', requestId });
  const startedAt = Date.now();
  let rounds = 0;
  let toolCalls = 0;
  // Validate before creating a thread: a rejected file must not leave an empty conversation.
  const attachments = (input.files ?? []).map((file) =>
    prepareChatAttachment({
      name: file.name,
      mimeType: file.mimeType,
      data: Buffer.from(file.data, 'base64'),
    }),
  );
  // A retry reuses its stored user message: no duplicate row, no second title, same files.
  const retryMessage = input.retryOf == null ? null : getChatMessageRow(db, input.retryOf);
  if (input.retryOf != null) {
    if (!retryMessage || retryMessage.role !== 'user') {
      turnLogger.error('chat retry message missing', { messageId: input.retryOf });
      throw new Error('retry message not found');
    }
    if (input.threadId != null && input.threadId !== retryMessage.thread_id) {
      turnLogger.error('chat retry thread mismatch', { messageId: input.retryOf, threadId: input.threadId });
      throw new Error('retry message belongs to another thread');
    }
    // The previous attempt's partial answer and tool rows would otherwise reach the provider.
    deleteChatMessagesAfter(db, retryMessage.thread_id, retryMessage.id);
  }
  const threadId =
    retryMessage?.thread_id ??
    input.threadId ??
    createChatThread(db, (input.title ?? input.message).trim().slice(0, 80) || attachments[0]?.name || 'New thread');
  const thread = getChatThread(db, threadId);
  if (!thread) {
    turnLogger.error('chat thread missing', { threadId });
    throw new Error('thread not found');
  }

  const pins = readChatPins(db);
  const userRefs = retryMessage ? getChatMessageRefs(db, retryMessage.id) : turnRefs(db, input, pins);
  const userMessageId =
    retryMessage?.id ??
    appendChatMessage(db, {
      threadId,
      role: 'user',
      content: input.message,
      refs: userRefs,
      attachments,
    });
  const userMessage = listChatMessages(db, threadId).at(-1);
  if (userMessage) emit({ type: 'meta', thread, message: userMessage });

  /** A provider failure is stored on the user message; Stop is not a failure and leaves no mark. */
  const markFailure = (message: string): void => {
    if (!options.signal?.aborted) setChatMessageError(db, userMessageId, message);
  };

  if (!base) {
    const message = `AI_NOT_CONFIGURED: set a base URL`;
    turnLogger.warn('chat not configured', { provider: settings.provider, missing: 'baseUrl' });
    markFailure(message);
    return finish({ thread, messages: listChatMessages(db, threadId), pending: null, error: message });
  }
  if (!key && settings.provider !== 'ollama') {
    const message = `AI_NOT_CONFIGURED: set ${env}`;
    turnLogger.warn('chat not configured', { provider: settings.provider, missing: 'apiKey' });
    markFailure(message);
    return finish({ thread, messages: listChatMessages(db, threadId), pending: null, error: message });
  }

  const client = options.client ?? localClient(db);
  const fetchImpl = options.fetchImpl ?? fetch;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createProfileServer(client, {
    limiter: writeLimiter(60),
    logger: getLogger(db, 'mcp', { source: 'server', requestId }),
    requestId,
    channel: 'chat',
  });
  await server.connect(serverTransport);
  const sdk = new Client({ name: 'profile-chat', version: '0.1.0' });
  await sdk.connect(clientTransport);

  const definitions = toolDefinitions(settings.readToolAllowList);
  const offered = new Set(definitions.map((definition) => definition.name));
  const storedFiles = listChatAttachmentData(db, threadId);
  const transcript = transcriptFor(db, threadId, storedFiles);
  const images = storedFiles
    .filter((file) => chatFileKind(file.name, file.mimeType) === 'image')
    .map((file) => ({ mimeType: file.mimeType, data: file.data.toString('base64') }));
  const system = composeChatPrompt(db) + chatItemContext(db, pins, userRefs);
  const session = providerSession(thread);
  const pendingWrite = input.confirm?.toolName ? { name: input.confirm.toolName, args: input.confirm.args } : null;

  let state: unknown = null;
  let error: string | null = null;
  let failure: unknown;
  let replied = false;
  /** A confirmed write or a declined one is a delivered result even with no assistant text. */
  let acted = false;
  let pending: ChatTurnResult['pending'] = null;

  try {
    const maxRounds = options.maxRounds ?? 4;
    const request = (roundState: unknown, tools: typeof definitions) =>
      callProviderWithRetry(fetchImpl, settings, base, key, session, {
        system,
        transcript,
        images,
        definitions: tools,
        state: roundState,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        reasoningEffort: settings.reasoningEffort,
        timeoutMs: settings.timeoutMs,
        stream: Boolean(options.onEvent),
        onDelta: (kind, text) => emit({ type: 'delta', kind, text }),
        signal: options.signal,
      });
    for (let round = 0; round < maxRounds; round++) {
      rounds += 1;
      // The last round has no tools: the model must summarize what it already fetched
      // instead of the loop ending silently after another tool call.
      const lastRound = round === maxRounds - 1;
      turnLogger.debug('chat provider request', {
        provider: settings.provider,
        model: settings.model,
        round: rounds,
        tools: lastRound ? 0 : definitions.length,
      });
      const roundStartedAt = Date.now();
      const providerResult = await request(state, lastRound ? [] : definitions);
      const roundDurationMs = Date.now() - roundStartedAt;
      // A gateway may leak DeepSeek's native markup as text; recover the calls and hide it.
      const dsml = parseDsmlReply(providerResult.reply.text, offered);
      const result = dsml
        ? {
            ...providerResult,
            reply: {
              text: dsml.text,
              reasoning: providerResult.reply.reasoning,
              calls: providerResult.reply.calls.length || lastRound ? providerResult.reply.calls : dsml.calls,
            },
          }
        : providerResult;
      state = result.state;
      // On the tool-less last round a leaked call means the model ignored the missing
      // tools; its prose is not the answer, so do not store it and let the nudge below ask.
      const lastRoundToolAttempt =
        lastRound &&
        (providerResult.reply.calls.length > 0 || (dsml != null && dsml.calls.length > 0));
      if (result.reply.text.trim() && !lastRoundToolAttempt) {
        replied = true;
        appendChatMessage(db, {
          threadId,
          role: 'assistant',
          content: result.reply.text.trim(),
          refs: extractChatRefs(result.reply.text.trim(), [...pins, ...userRefs]),
          reasoning: result.reply.reasoning.trim() || null,
          meta: {
            model: settings.model,
            durationMs: roundDurationMs,
            ...(result.usage ? { usage: result.usage } : {}),
          },
        });
      }
      if (!result.reply.calls.length) break;

      const runs: ToolRun[] = [];
      let stopped = false;
      for (const call of result.reply.calls) {
        if (isWriteTool(call.name)) {
          emit({ type: 'tool', callId: call.id, name: call.name, phase: 'start' });
          if (pendingWrite && pendingWrite.name === call.name) {
            toolCalls += 1;
            const done = await callRegistry(sdk, call.name, {
              ...call.args,
              ...pendingWrite.args,
              dry_run: false,
              confirm: true,
            });
            appendChatMessage(db, {
              threadId,
              role: 'tool',
              content: result.reply.text || `Wrote ${call.name}`,
              toolName: call.name,
              toolCallId: call.id,
              payload: done,
            });
            emit({ type: 'tool', callId: call.id, name: call.name, phase: 'done' });
            acted = true;
            stopped = true;
            continue;
          }
          const preview = await callRegistry(sdk, call.name, { ...call.args, dry_run: true, confirm: false });
          toolCalls += 1;
          const record = preview && typeof preview === 'object' ? (preview as Json) : {};
          const nested = record.result && typeof record.result === 'object' ? (record.result as Json) : {};
          const diff = (record.diff ?? nested.diff) as { human?: string } | undefined;
          pending = {
            toolName: call.name,
            args: call.args,
            human: diff?.human ?? `Confirm ${call.name}`,
            diff: preview,
          };
          appendChatMessage(db, {
            threadId,
            role: 'tool',
            content: `Confirmation required: ${call.name}`,
            toolName: call.name,
            toolCallId: call.id,
            payload: preview,
          });
          emit({ type: 'tool', callId: call.id, name: call.name, phase: 'done' });
          stopped = true;
          continue;
        }
        if (input.decline?.toolName === call.name) {
          const content = 'The owner declined this write.';
          appendChatMessage(db, {
            threadId,
            role: 'tool',
            content,
            toolName: call.name,
            toolCallId: call.id,
            payload: { declined: true },
          });
          emit({ type: 'tool', callId: call.id, name: call.name, phase: 'declined' });
          runs.push({ id: call.id, name: call.name, content, payload: { declined: true } });
          acted = true;
          continue;
        }
        emit({ type: 'tool', callId: call.id, name: call.name, phase: 'start' });
        const toolResult = await callRegistry(sdk, call.name, call.args);
        toolCalls += 1;
        const content = JSON.stringify(toolResult);
        appendChatMessage(db, {
          threadId,
          role: 'tool',
          content,
          toolName: call.name,
          toolCallId: call.id,
          payload: toolResult,
        });
        emit({ type: 'tool', callId: call.id, name: call.name, phase: 'done' });
        runs.push({ id: call.id, name: call.name, content, payload: toolResult });
      }
      if (stopped) break;
      state = appendToolRound(state, settings.provider, result.reply, runs);
    }
    // A provider can answer the tool-less round with another tool call, or with DeepSeek
    // markup that strips to nothing (the DeepSeek gateways do); that must not end the turn
    // silently after the tools have already run. Ask once more, plainly, for the answer.
    if (!replied && !pending && !acted) {
      rounds += 1;
      const roundStartedAt = Date.now();
      const nudge = await request(appendAnswerNudge(state, settings.provider), []);
      const dsml = parseDsmlReply(nudge.reply.text, offered);
      const text = (dsml ? dsml.text : nudge.reply.text).trim();
      if (text) {
        replied = true;
        appendChatMessage(db, {
          threadId,
          role: 'assistant',
          content: text,
          refs: extractChatRefs(text, [...pins, ...userRefs]),
          reasoning: nudge.reply.reasoning.trim() || null,
          meta: {
            model: settings.model,
            durationMs: Date.now() - roundStartedAt,
            ...(nudge.usage ? { usage: nudge.usage } : {}),
          },
        });
      }
    }
    // A compliant provider answers the tool-less last round; an empty one must not look
    // like a delivered reply, which was the silent "did nothing" turn. The user message
    // carries the reason, so the retry and the inline error survive a reload.
    if (!replied && !pending && !acted) {
      error = 'AI_EMPTY: the provider returned no text';
      markFailure(error);
    }
  } catch (turnError) {
    failure = turnError;
    error = turnError instanceof Error ? turnError.message : String(turnError);
    markFailure(error);
  } finally {
    await sdk.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }

  if (error == null) setChatMessageError(db, userMessageId, null);
  const durationMs = Date.now() - startedAt;
  const summary = {
    provider: settings.provider,
    model: settings.model,
    rounds,
    toolCalls,
    pending: pending != null,
    ok: error == null,
    error: error == null ? null : (error.split(':')[0] ?? '').slice(0, 80),
  };
  if (error) turnLogger.warn('chat turn finished', summary, failure, durationMs);
  else turnLogger.info('chat turn finished', summary, undefined, durationMs);

  return finish({
    thread: getChatThread(db, threadId) ?? thread,
    messages: listChatMessages(db, threadId),
    pending,
    error,
  });
}

/**
 * The same loop as `runChatTurn`, with the provider's fragments and tool phases delivered to
 * `emit` as they happen. Resolves after the terminal `done` frame; the route closes the body.
 */
export async function runChatTurnStream(
  db: Db,
  input: ChatSend,
  emit: (event: ChatStreamEvent) => void,
  options: Omit<ChatTurnOptions, 'onEvent'> = {},
): Promise<void> {
  await runChatTurn(db, input, { ...options, onEvent: emit });
}

async function callRegistry(sdk: Client, name: string, args: Json): Promise<unknown> {
  const response = await sdk.callTool({ name, arguments: args });
  const structured = (response as { structuredContent?: unknown }).structuredContent;
  if (structured !== undefined) return structured;
  const content = (response as { content?: { type: string; text?: string }[] }).content ?? [];
  const text = content.find((entry) => entry.type === 'text')?.text ?? '{}';
  return safeJson(text);
}

/** The tool-less answer round the model is told to use when it ignored the earlier one. */
const ANSWER_NUDGE =
  'No more tools are available: answer the question using the results above. Do not call a tool or print tool-call markup.';

/** Adds the answer-only user turn in the provider's own message shape. */
function appendAnswerNudge(state: unknown, provider: string): unknown {
  const messages = Array.isArray(state) ? state : [];
  if (provider === 'anthropic') {
    return [...messages, { role: 'user', content: [{ type: 'text', text: ANSWER_NUDGE }] }];
  }
  if (provider === 'google') {
    return [...messages, { role: 'user', parts: [{ text: ANSWER_NUDGE }] }];
  }
  return [...(messages as OpenAiMessage[]), { role: 'user', content: ANSWER_NUDGE }];
}

function appendToolRound(state: unknown, provider: string, reply: ProviderReply, runs: ToolRun[]): unknown {
  if (provider === 'anthropic') {
    const messages = Array.isArray(state) ? state : [];
    const assistant = [
      ...(reply.text.trim() ? [{ type: 'text', text: reply.text }] : []),
      ...reply.calls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: call.args })),
    ];
    return [
      ...messages,
      { role: 'assistant', content: assistant },
      {
        role: 'user',
        content: runs.map((run) => ({ type: 'tool_result', tool_use_id: run.id, content: run.content })),
      },
    ];
  }
  if (provider === 'google') {
    const contents = Array.isArray(state) ? state : [];
    const parts = [
      ...(reply.text.trim() ? [{ text: reply.text }] : []),
      ...reply.calls.map((call) => ({ functionCall: { name: call.name, args: call.args } })),
    ];
    return [
      ...contents,
      { role: 'model', parts },
      {
        role: 'user',
        parts: runs.map((run) => ({ functionResponse: { name: run.name, response: { result: run.payload } } })),
      },
    ];
  }
  const messages = Array.isArray(state) ? (state as OpenAiMessage[]) : [];
  messages.push({
    role: 'assistant',
    content: reply.text || null,
    tool_calls: reply.calls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: JSON.stringify(call.args) },
    })),
  });
  // OpenAI-compatible APIs reject an assistant `tool_calls` message with no `tool` reply.
  for (const run of runs) messages.push({ role: 'tool', tool_call_id: run.id, content: run.content });
  return messages;
}

/** A network failure, timeout, 429 or 5xx may succeed on the next attempt; a 4xx will not. */
function retryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const match = /^AI_HTTP_(\d{3})$/.exec(message);
  if (!match) return true;
  const status = Number(match[1]);
  return status === 429 || status >= 500;
}

async function callProviderWithRetry(
  fetchImpl: FetchLike,
  settings: ChatSettings,
  base: string,
  key: string | null,
  session: string,
  input: ProviderInput,
): Promise<ProviderResult> {
  // A stream that already delivered text is not retried: the reader saw it once already.
  let emitted = false;
  const attemptInput: ProviderInput = input.onDelta
    ? {
        ...input,
        onDelta: (kind, text) => {
          emitted = true;
          input.onDelta?.(kind, text);
        },
      }
    : input;
  for (let attempt = 0; ; attempt++) {
    try {
      return await callProvider(fetchImpl, settings.provider, base, key, settings.model, session, attemptInput);
    } catch (error) {
      if (input.signal?.aborted || attempt >= settings.retries || emitted || !retryable(error)) throw error;
      // A short backoff keeps a 429/5xx from turning one turn into a burst.
      await delay(250 * (attempt + 1));
    }
  }
}

/** The request timeout and the caller's cancel signal both stop the provider call. */
function requestSignal(input: ProviderInput): AbortSignal {
  const timeout = AbortSignal.timeout(input.timeoutMs);
  return input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
}

async function callProvider(
  fetchImpl: FetchLike,
  provider: string,
  base: string,
  key: string | null,
  model: string,
  session: string,
  input: ProviderInput,
): Promise<ProviderResult> {
  if (provider === 'anthropic') return callAnthropic(fetchImpl, base, key, model, input);
  if (provider === 'google') return callGoogle(fetchImpl, base, key, model, input);
  return callOpenAi(fetchImpl, provider, base, key, model, session, input);
}

/** OpenAI-compatible gateways occasionally return content parts instead of one string. */
function openAiText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const part of content) {
    if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
      text += part.text;
    }
  }
  return text;
}

/**
 * Provider token counts under their native names, normalized to input/output/total. A number
 * the provider did not send stays absent; nothing is estimated.
 */
function providerUsage(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const pick = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      if (!(key in raw)) continue;
      const value = Reflect.get(raw, key);
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return undefined;
  };
  const input = pick('prompt_tokens', 'input_tokens', 'promptTokenCount');
  const output = pick('completion_tokens', 'output_tokens', 'candidatesTokenCount');
  const total = pick('total_tokens', 'totalTokenCount');
  if (input === undefined && output === undefined && total === undefined) return undefined;
  return {
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
    ...(total === undefined ? {} : { total }),
  };
}

/**
 * Reads one provider SSE body line by line. JSON arrives split across network chunks, never
 * across lines, so a partial line is buffered until its newline. `data:` lines only — the
 * event name is not needed by any of the three vendors.
 */
async function readSse(response: Response, onData: (data: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI_STREAM: empty response body');
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (line: string): void => {
    const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (data) onData(data);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      consume(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);
}

/** Anthropic reports input and output tokens in separate frames; both are merged here. */
function mergeUsage(
  left: Record<string, number> | undefined,
  right: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!left && !right) return undefined;
  const merged: Record<string, number> = { ...left, ...right };
  if (merged.total === undefined && merged.input !== undefined && merged.output !== undefined) {
    merged.total = merged.input + merged.output;
  }
  return merged;
}

interface StreamedReply {
  text: string;
  reasoning: string;
  calls: ToolCall[];
}

async function streamOpenAi(
  response: Response,
  baseMessages: OpenAiMessage[],
  input: ProviderInput,
): Promise<ProviderResult> {
  let text = '';
  let reasoning = '';
  let usage: Record<string, number> | undefined;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();

  await readSse(response, (data) => {
    if (data === '[DONE]') return;
    const chunk = safeJson(data) as {
      choices?: {
        delta?: {
          content?: string | null;
          reasoning_content?: string | null;
          reasoning?: string | null;
          tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
        };
      }[];
      usage?: unknown;
    };
    usage = providerUsage(chunk.usage) ?? usage;
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;
    const reasoningText =
      typeof delta.reasoning_content === 'string'
        ? delta.reasoning_content
        : typeof delta.reasoning === 'string'
          ? delta.reasoning
          : '';
    if (reasoningText) {
      reasoning += reasoningText;
      input.onDelta?.('reasoning', reasoningText);
    }
    if (typeof delta.content === 'string' && delta.content) {
      text += delta.content;
      input.onDelta?.('text', delta.content);
    }
    for (const fragment of delta.tool_calls ?? []) {
      const index = typeof fragment.index === 'number' ? fragment.index : 0;
      const current = calls.get(index) ?? { id: '', name: '', arguments: '' };
      if (fragment.id) current.id = fragment.id;
      if (fragment.function?.name) current.name += fragment.function.name;
      if (fragment.function?.arguments) current.arguments += fragment.function.arguments;
      calls.set(index, current);
    }
  });

  const reply: StreamedReply = {
    text,
    reasoning,
    calls: [...calls.values()]
      .filter((call) => call.name)
      .map((call) => ({ id: call.id || crypto.randomUUID(), name: call.name, args: safeJson(call.arguments) })),
  };
  return { reply, state: baseMessages, usage };
}

interface AnthropicStreamBlock {
  type: string;
  id?: string;
  name?: string;
  json: string;
}

async function streamAnthropic(
  response: Response,
  baseMessages: unknown[],
  input: ProviderInput,
): Promise<ProviderResult> {
  let text = '';
  let reasoning = '';
  let usage: Record<string, number> | undefined;
  const blocks = new Map<number, AnthropicStreamBlock>();

  await readSse(response, (data) => {
    const event = safeJson(data) as {
      type?: string;
      index?: number;
      message?: { usage?: unknown };
      content_block?: { type?: string; id?: string; name?: string };
      delta?: { type?: string; text?: string; thinking?: string; partial_json?: string };
      usage?: unknown;
    };
    if (event.type === 'message_start') usage = mergeUsage(usage, providerUsage(event.message?.usage));
    if (event.type === 'content_block_start' && typeof event.index === 'number') {
      blocks.set(event.index, {
        type: event.content_block?.type ?? '',
        id: event.content_block?.id,
        name: event.content_block?.name,
        json: '',
      });
    }
    if (event.type === 'content_block_delta') {
      const block = typeof event.index === 'number' ? blocks.get(event.index) : undefined;
      const delta = event.delta;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        text += delta.text;
        input.onDelta?.('text', delta.text);
      }
      if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        reasoning += delta.thinking;
        input.onDelta?.('reasoning', delta.thinking);
      }
      if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string' && block) {
        block.json += delta.partial_json;
      }
    }
    if (event.type === 'message_delta') usage = mergeUsage(usage, providerUsage(event.usage));
  });

  const reply: StreamedReply = {
    text,
    reasoning,
    calls: [...blocks.values()]
      .filter((block) => block.type === 'tool_use' && block.name)
      .map((block) => ({ id: block.id || crypto.randomUUID(), name: block.name ?? '', args: safeJson(block.json) })),
  };
  return { reply, state: baseMessages, usage };
}

async function streamGoogle(
  response: Response,
  baseContents: unknown[],
  input: ProviderInput,
): Promise<ProviderResult> {
  let text = '';
  let reasoning = '';
  let usage: Record<string, number> | undefined;
  const calls: ToolCall[] = [];

  await readSse(response, (data) => {
    const chunk = safeJson(data) as {
      candidates?: {
        content?: { parts?: { text?: string; thought?: boolean; functionCall?: { name?: string; args?: Json } }[] };
      }[];
      usageMetadata?: unknown;
    };
    usage = providerUsage(chunk.usageMetadata) ?? usage;
    for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
      if (part.functionCall) {
        calls.push({ id: crypto.randomUUID(), name: part.functionCall.name ?? '', args: part.functionCall.args ?? {} });
        continue;
      }
      if (typeof part.text !== 'string' || !part.text) continue;
      if (part.thought === true) {
        reasoning += part.text;
        input.onDelta?.('reasoning', part.text);
      } else {
        text += part.text;
        input.onDelta?.('text', part.text);
      }
    }
  });

  return { reply: { text, reasoning, calls }, state: baseContents, usage };
}

async function callOpenAi(
  fetchImpl: FetchLike,
  provider: string,
  base: string,
  key: string | null,
  model: string,
  session: string,
  input: ProviderInput,
): Promise<ProviderResult> {
  const userContent: OpenAiContentPart[] | string =
    input.images.length === 0
      ? input.transcript
      : [
          { type: 'text', text: input.transcript },
          ...input.images.map((image) => ({
            type: 'image_url' as const,
            image_url: { url: `data:${image.mimeType};base64,${image.data}` },
          })),
        ];
  const messages: OpenAiMessage[] = Array.isArray(input.state)
    ? (input.state as OpenAiMessage[])
    : [
        { role: 'system', content: input.system },
        { role: 'user', content: userContent },
      ];
  const console = provider === 'opencode' || provider === 'opencode-go';
  const effort =
    input.reasoningEffort == null
      ? {}
      : provider === 'openai'
        ? { reasoning_effort: input.reasoningEffort }
        : provider === 'openrouter'
          ? { reasoning: { effort: input.reasoningEffort } }
          : {};
  const response = await fetchImpl(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(console ? { 'x-opencode-session': session } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      messages,
      ...(input.definitions.length
        ? {
            tools: input.definitions.map((definition) => ({ type: 'function', function: definition })),
            tool_choice: 'auto',
          }
        : {}),
      ...effort,
      ...(input.stream
        ? {
            stream: true,
            ...(provider === 'openai' || provider === 'openrouter' ? { stream_options: { include_usage: true } } : {}),
          }
        : {}),
    }),
    signal: requestSignal(input),
  });
  if (!response.ok) throw new Error(`AI_HTTP_${response.status}`);
  if (input.stream) return streamOpenAi(response, messages, input);
  const body = (await response.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
        reasoning?: string | null;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      };
    }[];
    usage?: unknown;
  };
  const message = body.choices?.[0]?.message;
  const reasoning =
    typeof message?.reasoning_content === 'string'
      ? message.reasoning_content
      : typeof message?.reasoning === 'string'
        ? message.reasoning
        : '';
  return {
    reply: {
      text: openAiText(message?.content),
      reasoning,
      calls: (message?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        args: safeJson(call.function.arguments),
      })),
    },
    state: messages,
    usage: providerUsage(body.usage),
  };
}

async function callAnthropic(
  fetchImpl: FetchLike,
  base: string,
  key: string | null,
  model: string,
  input: ProviderInput,
): Promise<ProviderResult> {
  const content = [
    { type: 'text', text: input.transcript },
    ...input.images.map((image) => ({
      type: 'image',
      source: { type: 'base64', media_type: image.mimeType, data: image.data },
    })),
  ];
  const messages = Array.isArray(input.state) ? input.state : [{ role: 'user', content }];
  const response = await fetchImpl(`${base}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      system: input.system,
      messages,
      ...(input.definitions.length
        ? {
            tools: input.definitions.map((definition) => ({
              name: definition.name,
              description: definition.description,
              input_schema: definition.parameters,
            })),
          }
        : {}),
    }),
    signal: requestSignal(input),
  });
  if (!response.ok) throw new Error(`AI_HTTP_${response.status}`);
  if (input.stream) return streamAnthropic(response, messages, input);
  const body = (await response.json()) as {
    content?: { type: string; text?: string; thinking?: string; id?: string; name?: string; input?: Json }[];
    usage?: unknown;
  };
  const blocks = body.content ?? [];
  return {
    reply: {
      text: blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n'),
      reasoning: blocks
        .filter((block) => block.type === 'thinking')
        .map((block) => block.thinking ?? '')
        .join('\n'),
      calls: blocks
        .filter((block) => block.type === 'tool_use')
        .map((block) => ({ id: block.id ?? crypto.randomUUID(), name: block.name ?? '', args: block.input ?? {} })),
    },
    state: messages,
    usage: providerUsage(body.usage),
  };
}

async function callGoogle(
  fetchImpl: FetchLike,
  base: string,
  key: string | null,
  model: string,
  input: ProviderInput,
): Promise<ProviderResult> {
  const requestParts = [
    { text: input.transcript },
    ...input.images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } })),
  ];
  const contents = Array.isArray(input.state) ? input.state : [{ role: 'user', parts: requestParts }];
  const action = input.stream ? 'streamGenerateContent?alt=sse&key=' : 'generateContent?key=';
  const response = await fetchImpl(
    `${base}/models/${encodeURIComponent(model)}:${action}${encodeURIComponent(key ?? '')}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents,
        generationConfig: { temperature: input.temperature, maxOutputTokens: input.maxTokens },
        ...(input.definitions.length ? { tools: [{ functionDeclarations: input.definitions }] } : {}),
      }),
      signal: requestSignal(input),
    },
  );
  if (!response.ok) throw new Error(`AI_HTTP_${response.status}`);
  if (input.stream) return streamGoogle(response, contents, input);
  const body = (await response.json()) as {
    candidates?: {
      content?: { parts?: { text?: string; thought?: boolean; functionCall?: { name?: string; args?: Json } }[] };
    }[];
    usageMetadata?: unknown;
  };
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  return {
    reply: {
      text: parts
        .filter((part) => part.thought !== true)
        .map((part) => part.text ?? '')
        .join(''),
      reasoning: parts
        .filter((part) => part.thought === true)
        .map((part) => part.text ?? '')
        .join(''),
      calls: parts
        .filter((part) => part.functionCall)
        .map((part) => ({
          id: crypto.randomUUID(),
          name: part.functionCall?.name ?? '',
          args: part.functionCall?.args ?? {},
        })),
    },
    state: contents,
    usage: providerUsage(body.usageMetadata),
  };
}

/** Thread helpers the HTTP routes use without knowing the storage module. */
export function chatThreads(db: Db) {
  return listChatThreads(db);
}

export function chatThreadMessages(db: Db, threadId: number) {
  const thread = getChatThread(db, threadId);
  return thread ? { thread, messages: listChatMessages(db, threadId) } : null;
}
