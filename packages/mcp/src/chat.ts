import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CHAT_ATTACHMENT_LIMITS,
  chatFileKind,
  type ChatSend,
  type ChatSettings,
  type ChatTurnResult,
} from '@profile/shared/contracts';
import {
  appendChatMessage,
  composeChatPrompt,
  createChatThread,
  getChatSettingsRow,
  getChatThread,
  listChatAttachmentData,
  listChatMessages,
  listChatThreads,
  prepareChatAttachment,
  resolveApiKey,
  resolveBaseUrl,
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
  calls: ToolCall[];
}

interface ProviderResult {
  reply: ProviderReply;
  /** Provider-specific continuation state (OpenAI messages, Anthropic blocks, Google contents). */
  state: unknown;
}

export interface ChatTurnOptions {
  fetchImpl?: FetchLike;
  maxRounds?: number;
  client?: ProfileClient;
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
      return `${label}: ${message.content}${blocks}`;
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

/**
 * OpenCode Console routes a conversation by `x-opencode-session` and the Go plan refuses a
 * request without it. Derive a stable opaque id per thread so a retry reuses its route.
 */
function providerSession(thread: { id: number; createdAt: string }): string {
  return `ses_${createHash('sha256').update(`${thread.id}:${thread.createdAt}`).digest('hex').slice(0, 32)}`;
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
  // Validate before creating a thread: a rejected file must not leave an empty conversation.
  const attachments = (input.files ?? []).map((file) =>
    prepareChatAttachment({
      name: file.name,
      mimeType: file.mimeType,
      data: Buffer.from(file.data, 'base64'),
    }),
  );
  const threadId =
    input.threadId ??
    createChatThread(
      db,
      (input.title ?? input.message).trim().slice(0, 80) || attachments[0]?.name || 'New thread',
    );
  const thread = getChatThread(db, threadId);
  if (!thread) throw new Error('thread not found');

  appendChatMessage(db, {
    threadId,
    role: 'user',
    content: input.message,
    attachments,
  });

  if (!base) {
    return { thread, messages: listChatMessages(db, threadId), pending: null, error: `AI_NOT_CONFIGURED: set a base URL` };
  }
  if (!key && settings.provider !== 'ollama') {
    return { thread, messages: listChatMessages(db, threadId), pending: null, error: `AI_NOT_CONFIGURED: set ${env}` };
  }

  const client = options.client ?? localClient(db);
  const fetchImpl = options.fetchImpl ?? fetch;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createProfileServer(client, { limiter: writeLimiter(60) });
  await server.connect(serverTransport);
  const sdk = new Client({ name: 'profile-chat', version: '0.1.0' });
  await sdk.connect(clientTransport);

  const definitions = toolDefinitions(settings.readToolAllowList);
  const storedFiles = listChatAttachmentData(db, threadId);
  const transcript = transcriptFor(db, threadId, storedFiles);
  const images = storedFiles
    .filter((file) => chatFileKind(file.name, file.mimeType) === 'image')
    .map((file) => ({ mimeType: file.mimeType, data: file.data.toString('base64') }));
  const system = composeChatPrompt(db);
  const session = providerSession(thread);
  const pendingWrite = input.confirm?.toolName
    ? { name: input.confirm.toolName, args: input.confirm.args }
    : null;

  let state: unknown = null;
  let error: string | null = null;
  let replied = false;
  let pending: ChatTurnResult['pending'] = null;

  try {
    const maxRounds = options.maxRounds ?? 4;
    for (let round = 0; round < maxRounds; round++) {
      // The last round has no tools: the model must summarize what it already fetched
      // instead of the loop ending silently after another tool call.
      const lastRound = round === maxRounds - 1;
      const result = await callProviderWithRetry(fetchImpl, settings, base, key, session, {
        system,
        transcript,
        images,
        definitions: lastRound ? [] : definitions,
        state,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        reasoningEffort: settings.reasoningEffort,
        timeoutMs: settings.timeoutMs,
      });
      state = result.state;
      if (result.reply.text.trim()) {
        replied = true;
        appendChatMessage(db, { threadId, role: 'assistant', content: result.reply.text.trim() });
      }
      if (!result.reply.calls.length) break;

      const runs: ToolRun[] = [];
      let stopped = false;
      for (const call of result.reply.calls) {
        if (isWriteTool(call.name)) {
          if (pendingWrite && pendingWrite.name === call.name) {
            const done = await callRegistry(sdk, call.name, { ...call.args, ...pendingWrite.args, dry_run: false, confirm: true });
            appendChatMessage(db, {
              threadId,
              role: 'tool',
              content: result.reply.text || `Wrote ${call.name}`,
              toolName: call.name,
              toolCallId: call.id,
              payload: done,
            });
            stopped = true;
            continue;
          }
          const preview = await callRegistry(sdk, call.name, { ...call.args, dry_run: true, confirm: false });
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
          runs.push({ id: call.id, name: call.name, content, payload: { declined: true } });
          continue;
        }
        const toolResult = await callRegistry(sdk, call.name, call.args);
        const content = JSON.stringify(toolResult);
        appendChatMessage(db, {
          threadId,
          role: 'tool',
          content,
          toolName: call.name,
          toolCallId: call.id,
          payload: toolResult,
        });
        runs.push({ id: call.id, name: call.name, content, payload: toolResult });
      }
      if (stopped) break;
      state = appendToolRound(state, settings.provider, result.reply, runs);
    }
    // A compliant provider answers the tool-less last round; an empty one must not look
    // like a delivered reply, which was the silent "did nothing" turn.
    if (!replied && !pending) error = 'AI_EMPTY: the provider returned no text';
  } catch (turnError) {
    error = turnError instanceof Error ? turnError.message : String(turnError);
  } finally {
    await sdk.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }

  return { thread: getChatThread(db, threadId) ?? thread, messages: listChatMessages(db, threadId), pending, error };
}

async function callRegistry(sdk: Client, name: string, args: Json): Promise<unknown> {
  const response = await sdk.callTool({ name, arguments: args });
  const structured = (response as { structuredContent?: unknown }).structuredContent;
  if (structured !== undefined) return structured;
  const content = (response as { content?: { type: string; text?: string }[] }).content ?? [];
  const text = content.find((entry) => entry.type === 'text')?.text ?? '{}';
  return safeJson(text);
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
      { role: 'user', content: runs.map((run) => ({ type: 'tool_result', tool_use_id: run.id, content: run.content })) },
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
  for (let attempt = 0; ; attempt++) {
    try {
      return await callProvider(fetchImpl, settings.provider, base, key, settings.model, session, input);
    } catch (error) {
      if (attempt >= settings.retries || !retryable(error)) throw error;
      // A short backoff keeps a 429/5xx from turning one turn into a burst.
      await delay(250 * (attempt + 1));
    }
  }
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
    : [{ role: 'system', content: input.system }, { role: 'user', content: userContent }];
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
    }),
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  if (!response.ok) throw new Error(`AI_HTTP_${response.status}`);
  const body = (await response.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
  };
  const message = body.choices?.[0]?.message;
  return {
    reply: {
      text: message?.content ?? '',
      calls: (message?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        args: safeJson(call.function.arguments),
      })),
    },
    state: messages,
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
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  if (!response.ok) throw new Error(`AI_HTTP_${response.status}`);
  const body = (await response.json()) as { content?: { type: string; text?: string; id?: string; name?: string; input?: Json }[] };
  const blocks = body.content ?? [];
  return {
    reply: {
      text: blocks.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n'),
      calls: blocks
        .filter((block) => block.type === 'tool_use')
        .map((block) => ({ id: block.id ?? crypto.randomUUID(), name: block.name ?? '', args: block.input ?? {} })),
    },
    state: messages,
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
  const response = await fetchImpl(`${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key ?? '')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents,
      generationConfig: { temperature: input.temperature, maxOutputTokens: input.maxTokens },
      ...(input.definitions.length ? { tools: [{ functionDeclarations: input.definitions }] } : {}),
    }),
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  if (!response.ok) throw new Error(`AI_HTTP_${response.status}`);
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string; functionCall?: { name?: string; args?: Json } }[] } }[];
  };
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  return {
    reply: {
      text: parts.map((part) => part.text ?? '').join(''),
      calls: parts
        .filter((part) => part.functionCall)
        .map((part) => ({
          id: crypto.randomUUID(),
          name: part.functionCall?.name ?? '',
          args: part.functionCall?.args ?? {},
        })),
    },
    state: contents,
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
