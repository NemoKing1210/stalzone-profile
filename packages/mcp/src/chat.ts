import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CHAT_ATTACHMENT_LIMITS,
  chatFileKind,
  type ChatSend,
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
  const threadId =
    input.threadId ??
    createChatThread(
      db,
      (input.title ?? input.message).trim().slice(0, 80) || input.files?.[0]?.name || 'New thread',
    );
  const thread = getChatThread(db, threadId);
  if (!thread) throw new Error('thread not found');

  appendChatMessage(db, {
    threadId,
    role: 'user',
    content: input.message,
    attachments: (input.files ?? []).map((file) => ({
      name: file.name,
      mimeType: file.mimeType,
      data: Buffer.from(file.data, 'base64'),
    })),
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
  let pending: ChatTurnResult['pending'] = null;

  try {
    for (let round = 0; round < (options.maxRounds ?? 4); round++) {
      const result = await callProvider(fetchImpl, settings.provider, base, key, settings.model, session, {
        system,
        transcript,
        images,
        definitions,
        state,
      });
      state = result.state;
      if (result.reply.text.trim()) {
        appendChatMessage(db, { threadId, role: 'assistant', content: result.reply.text.trim() });
      }
      if (!result.reply.calls.length) break;

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
          appendChatMessage(db, {
            threadId,
            role: 'tool',
            content: 'The owner declined this write.',
            toolName: call.name,
            toolCallId: call.id,
            payload: { declined: true },
          });
          continue;
        }
        const toolResult = await callRegistry(sdk, call.name, call.args);
        appendChatMessage(db, {
          threadId,
          role: 'tool',
          content: JSON.stringify(toolResult),
          toolName: call.name,
          toolCallId: call.id,
          payload: toolResult,
        });
      }
      if (stopped) break;
      state = appendToolRound(state, settings.provider, result.reply);
    }
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

function appendToolRound(state: unknown, provider: string, reply: ProviderReply): unknown {
  if (provider === 'anthropic' || provider === 'google') return state;
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
  return messages;
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
  const response = await fetchImpl(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(console ? { 'x-opencode-session': session } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
      tools: input.definitions.map((definition) => ({ type: 'function', function: definition })),
      tool_choice: 'auto',
    }),
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
  const response = await fetchImpl(`${base}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: input.system,
      messages: [{ role: 'user', content }],
      tools: input.definitions.map((definition) => ({
        name: definition.name,
        description: definition.description,
        input_schema: definition.parameters,
      })),
    }),
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
    state: null,
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
  const response = await fetchImpl(`${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key ?? '')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: 'user', parts: requestParts }],
      tools: [{ functionDeclarations: input.definitions }],
    }),
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
    state: null,
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
