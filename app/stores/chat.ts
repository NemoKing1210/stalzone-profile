import { defineStore } from 'pinia';
import type {
  ChatAttachmentInput,
  ChatMessage,
  ChatPendingWrite,
  ChatThread,
  ChatThreadRead,
  ChatTurnResult,
} from '@profile/shared/contracts';

import { chatHttpStatus, turnOutcome, type TurnToast } from '~/shared/lib/chatTurnOutcome';
import { emptyLiveTurn, parseSseChunk, reduceLiveTurn, threadToReloadAfterAbort, type LiveTurn } from '~/shared/lib/chatStream';

/**
 * The assistant conversation lives here, once per SPA: an in-flight turn survives route
 * changes, and a completion that lands off `/chat` is reported by a toast instead of being
 * lost with the unmounted page.
 */
export const useChatStore = defineStore('chat', () => {
  // Pinia setup stores are not a component setup, so `useI18n()` would throw when the
  // store is first created outside one (a panel opened from the palette, HMR, a plugin).
  const { t } = useNuxtApp().$i18n;
  const { message: apiMessage } = useApiError();
  const { write } = useWrite();
  const toast = useToast();
  const route = useRoute();

  /** Provider failures arrive as `AI_HTTP_<status>`; everything else is already readable. */
  function formatTurnError(raw: string): string {
    const status = chatHttpStatus(raw);
    if (status) return t('chat.providerHttpError', { status });
    if (raw.startsWith('AI_EMPTY')) return t('chat.emptyReply');
    if (raw.startsWith('AI_NOT_CONFIGURED')) {
      const env = raw.includes('set ') ? raw.slice(raw.indexOf('set ') + 4).trim() : '';
      return env ? t('chat.notConfigured', { env }) : t('chat.failedDescription');
    }
    return raw;
  }

  const threads = ref<ChatThread[]>([]);
  const activeThreadId = ref<number | null>(null);
  const messages = ref<ChatMessage[]>([]);
  /** A confirmation belongs to its thread; switching away and back restores it. */
  const pendingByThread = ref<Record<number, ChatPendingWrite | null>>({});
  const sending = ref(false);
  /** True only while the provider is delivering fragments; `sending` stays true through the save. */
  const streaming = ref(false);
  /** The answer being streamed; persisted rows are replaced by the canonical list on `done`. */
  const live = ref<LiveTurn | null>(null);
  const aborter = ref<AbortController | null>(null);
  const loadError = ref<string | null>(null);
  const threadsLoaded = ref(false);

  /** A new/open-thread navigation; a stale turn cannot adopt a conversation the owner left. */
  let navigation = 0;

  const activeThread = computed(() => threads.value.find((thread) => thread.id === activeThreadId.value) ?? null);
  const pending = computed(() =>
    activeThreadId.value == null ? null : (pendingByThread.value[activeThreadId.value] ?? null),
  );

  function setPending(threadId: number, value: ChatPendingWrite | null): void {
    if (value) {
      pendingByThread.value = { ...pendingByThread.value, [threadId]: value };
      return;
    }
    const { [threadId]: _cleared, ...rest } = pendingByThread.value;
    pendingByThread.value = rest;
  }

  async function loadThreads(): Promise<void> {
    threads.value = await $fetch<ChatThread[]>('/api/v1/chat/threads');
    threadsLoaded.value = true;
  }

  /** Idempotent first load; a return to `/chat` keeps the stored thread and messages. */
  async function init(): Promise<void> {
    if (!threadsLoaded.value) await loadThreads();
  }

  async function openThread(id: number): Promise<void> {
    let read: ChatThreadRead;
    try {
      read = await $fetch<ChatThreadRead>(`/api/v1/chat/threads/${id}`);
    } catch (error) {
      // A thread deleted in another tab (or before a reload) is gone; drop the stale row
      // instead of leaving a list entry that fails on every click.
      const status = (error as { statusCode?: number; status?: number } | null)?.statusCode;
      if (status === 404) {
        threads.value = threads.value.filter((thread) => thread.id !== id);
        if (activeThreadId.value === id) newThread();
        return;
      }
      throw error;
    }
    navigation += 1;
    activeThreadId.value = read.thread.id;
    messages.value = read.messages;
    loadError.value = null;
  }

  function newThread(): void {
    navigation += 1;
    activeThreadId.value = null;
    messages.value = [];
    loadError.value = null;
  }

  function notify(kind: TurnToast, result: ChatTurnResult, errorText: string | null): void {
    if (kind === 'pending') {
      toast.add({
        title: t('chat.background.pendingTitle'),
        description: t('chat.background.pendingText', { title: result.thread.title }),
        color: 'warning',
        icon: 'i-lucide-hand',
      });
      return;
    }
    if (kind === 'error') {
      toast.add({
        title: t('chat.failed'),
        description: errorText || t('chat.failedDescription'),
        color: 'error',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }
    if (kind === 'reply') {
      toast.add({
        title: t('chat.background.replyTitle'),
        description: result.thread.title,
        color: 'success',
        icon: 'i-lucide-message-circle',
      });
    }
  }

  /** Stops the in-flight turn; the stream closes and the thread is reloaded from the database. */
  function stop(): void {
    aborter.value?.abort();
  }

  /**
   * One streamed turn. The provider's fragments update `live`; the terminal frame replaces the
   * transcript with the canonical rows. A turn the owner navigated away from still finishes in
   * the store and reports through a toast, exactly like the non-streaming path did.
   */
  async function turn(body: Record<string, unknown>): Promise<void> {
    if (sending.value) return;
    sending.value = true;
    const requestThreadId = activeThreadId.value;
    const navigationAtRequest = navigation;
    loadError.value = null;
    const controller = new AbortController();
    aborter.value = controller;
    let adoptedThreadId: number | null = requestThreadId;

    const showFailure = (message: string): void => {
      if (activeThreadId.value === requestThreadId) loadError.value = message;
      toast.add({
        title: t('chat.failed'),
        description: message,
        color: 'error',
        icon: 'i-lucide-triangle-alert',
      });
    };

    try {
      const response = await fetch('/api/v1/chat/turn/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId: requestThreadId ?? undefined, ...body }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        showFailure(apiMessage(data?.error?.code, data?.error?.message || t('chat.failedDescription')));
        return;
      }
      if (!response.body) throw new Error('AI_EMPTY: the stream had no body');

      live.value = emptyLiveTurn();
      streaming.value = true;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let terminal: ChatTurnResult | null = null;
      let streamError: string | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (event.type === 'done') {
            terminal = {
              thread: event.thread,
              messages: event.messages,
              pending: event.pending,
              error: event.error,
            };
            continue;
          }
          if (event.type === 'error') {
            streamError = event.message;
            continue;
          }
          if (event.type === 'meta') {
            adoptedThreadId = event.thread.id;
            const adopt = requestThreadId != null || navigation === navigationAtRequest;
            if (adopt && !messages.value.some((message) => message.id === event.message.id)) {
              activeThreadId.value = event.thread.id;
              messages.value = [...messages.value, event.message];
            }
          }
          live.value = reduceLiveTurn(live.value ?? emptyLiveTurn(), event);
        }
      }

      if (!terminal) throw new Error(streamError ?? 'AI_EMPTY: the stream ended without a reply');
      streaming.value = false;
      const outcome = turnOutcome(terminal, activeThreadId.value, route.path);
      // A brand-new thread may adopt its id only when the owner did not start another one.
      const adopt = outcome.apply && (requestThreadId != null || navigation === navigationAtRequest);
      const errorText = terminal.error ? formatTurnError(terminal.error) : null;
      setPending(terminal.thread.id, terminal.pending);
      if (adopt) {
        activeThreadId.value = terminal.thread.id;
        messages.value = terminal.messages;
        // The open conversation shows the provider failure inline; it was silent before.
        loadError.value = errorText;
      }
      notify(outcome.toast, terminal, errorText);
    } catch (error) {
      if (controller.signal.aborted) {
        // Stop or a closed tab: the database is the truth, no half-answer stays on screen.
        const reload = threadToReloadAfterAbort(activeThreadId.value, adoptedThreadId);
        if (reload != null) await openThread(reload).catch(() => undefined);
        return;
      }
      const message = error instanceof Error ? formatTurnError(error.message) : t('chat.failedDescription');
      showFailure(message);
    } finally {
      streaming.value = false;
      live.value = null;
      aborter.value = null;
      // `sending` stays true through the thread-list refresh; thread switching stays allowed.
      await loadThreads().catch(() => undefined);
      sending.value = false;
    }
  }

  async function send(message: string, files: ChatAttachmentInput[] = []): Promise<void> {
    const text = message.trim();
    if (!text && files.length === 0) return;
    await turn({ message: text, ...(files.length ? { files } : {}) });
  }

  /**
   * Deletes one thread through the audited write route. The active conversation resets to a
   * fresh thread; a turn in flight blocks the delete so its reply cannot land in a dead thread.
   */
  async function deleteThread(threadId: number): Promise<boolean> {
    if (sending.value) return false;
    const removed = threads.value.find((thread) => thread.id === threadId);
    const result = await write<{ dryRun: boolean }>(`/api/v1/chat/threads/${threadId}`, {
      method: 'DELETE',
      body: { dryRun: false },
      silent: true,
      reconcile: 'none',
    });
    if (!result) return false;
    threads.value = threads.value.filter((thread) => thread.id !== threadId);
    setPending(threadId, null);
    if (activeThreadId.value === threadId) {
      navigation += 1;
      activeThreadId.value = null;
      messages.value = [];
      loadError.value = null;
    }
    toast.add({
      title: t('chat.threadDeleted'),
      description: removed?.title,
      color: 'success',
      icon: 'i-lucide-trash-2',
    });
    return true;
  }

  async function confirmPending(): Promise<void> {
    const write = pending.value;
    const threadId = activeThreadId.value;
    if (!write || threadId == null) return;
    setPending(threadId, null);
    await turn({ message: t('chat.confirmed'), confirm: { toolName: write.toolName, args: write.args } });
  }

  async function declinePending(): Promise<void> {
    const write = pending.value;
    const threadId = activeThreadId.value;
    if (!write || threadId == null) return;
    setPending(threadId, null);
    await turn({ message: t('chat.declined'), decline: { toolName: write.toolName } });
  }

  return {
    threads,
    activeThreadId,
    messages,
    pendingByThread,
    sending,
    streaming,
    live,
    loadError,
    activeThread,
    pending,
    init,
    loadThreads,
    openThread,
    newThread,
    send,
    stop,
    deleteThread,
    confirmPending,
    declinePending,
  };
});
