import { defineStore } from 'pinia';
import {
  CHAT_PIN_LIMIT,
  type ChatAttachmentInput,
  type ChatMessage,
  type ChatPendingWrite,
  type ChatPin,
  type ChatPinsRead,
  type ChatPinTarget,
  type ChatSendRef,
  type ChatThread,
  type ChatThreadRead,
  type ChatTurnResult,
} from '@profile/shared/contracts';

import { formatChatError, turnOutcome, type TurnToast } from '~/shared/lib/chatTurnOutcome';
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

  const threads = ref<ChatThread[]>([]);
  const activeThreadId = ref<number | null>(null);
  const messages = ref<ChatMessage[]>([]);
  /** A confirmation belongs to its thread; switching away and back restores it. */
  const pendingByThread = ref<Record<number, ChatPendingWrite | null>>({});
  const sending = ref(false);
  /** Turns waiting behind the one in flight; the composer keeps accepting messages meanwhile. */
  const queue = ref<{ body: Record<string, unknown>; threadId: number | null }[]>([]);
  let pumping = false;
  /** The message a queued retry is re-running, so a double click cannot queue it twice. */
  let runningRetry: number | null = null;
  /** True only while the provider is delivering fragments; `sending` stays true through the save. */
  const streaming = ref(false);
  /** The answer being streamed; persisted rows are replaced by the canonical list on `done`. */
  const live = ref<LiveTurn | null>(null);
  const aborter = ref<AbortController | null>(null);
  const loadError = ref<string | null>(null);
  const threadsLoaded = ref(false);
  const pins = ref<ChatPin[]>([]);
  const pinLimit = ref(CHAT_PIN_LIMIT);
  const pinsLoading = ref(false);
  const pinsLoaded = ref(false);
  const pinsError = ref<string | null>(null);

  /** A new/open-thread navigation; a stale turn cannot adopt a conversation the owner left. */
  let navigation = 0;

  const activeThread = computed(() => threads.value.find((thread) => thread.id === activeThreadId.value) ?? null);
  const queued = computed(() => queue.value.length);
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

  /** The shelf is auxiliary: a failed read leaves chat usable and reports on the next toggle. */
  async function loadPins(): Promise<void> {
    if (pinsLoading.value) return;
    pinsLoading.value = true;
    try {
      const read = await $fetch<ChatPinsRead>('/api/v1/chat/pins');
      pins.value = read.pins;
      pinLimit.value = read.limit;
      pinsLoaded.value = true;
      pinsError.value = null;
    } catch (error) {
      pinsError.value = errorMessage(error, t('chat.pins.failed'));
    } finally {
      pinsLoading.value = false;
    }
  }

  function errorDetails(error: unknown): { code?: string; message?: string } {
    if (!error || typeof error !== 'object' || !('data' in error)) return {};
    const data = error.data;
    if (!data || typeof data !== 'object' || !('error' in data)) return {};
    const body = data.error;
    if (!body || typeof body !== 'object') return {};
    return {
      code: 'code' in body && typeof body.code === 'string' ? body.code : undefined,
      message: 'message' in body && typeof body.message === 'string' ? body.message : undefined,
    };
  }

  function errorMessage(error: unknown, fallback: string): string {
    const detail = errorDetails(error);
    return apiMessage(detail.code, detail.message || fallback);
  }

  /** Replace the shelf; the server returns the canonical, enriched list. */
  async function setPins(targets: ChatPinTarget[]): Promise<boolean> {
    if (pinsLoading.value) return false;
    pinsLoading.value = true;
    try {
      const read = await $fetch<ChatPinsRead>('/api/v1/chat/pins', {
        method: 'PUT',
        body: { pins: targets },
      });
      pins.value = read.pins;
      pinLimit.value = read.limit;
      pinsLoaded.value = true;
      pinsError.value = null;
      return true;
    } catch (error) {
      const message = errorMessage(error, t('chat.pins.failed'));
      pinsError.value = message;
      toast.add({
        title: t('chat.pins.failed'),
        description: message,
        color: 'error',
        icon: 'i-lucide-triangle-alert',
      });
      return false;
    } finally {
      pinsLoading.value = false;
    }
  }

  function pinTarget(pin: ChatPin | ChatPinTarget): ChatPinTarget {
    return {
      kind: pin.kind,
      itemId: pin.itemId,
      ...('instanceId' in pin && pin.instanceId != null ? { instanceId: pin.instanceId } : {}),
    };
  }

  /** A pin is cheap to keep and easy to remove; the cap is checked before the request. */
  async function togglePin(target: ChatPinTarget): Promise<boolean> {
    const key = (pin: { kind: string; itemId: number; instanceId?: number | null }): string =>
      `${pin.kind}:${pin.itemId}:${pin.instanceId ?? 'catalog'}`;
    const existing = pins.value.find((pin) => key(pin) === key(target));
    const next = existing
      ? pins.value.filter((pin) => key(pin) !== key(target))
      : [...pins.value, target];
    if (!existing && next.length > pinLimit.value) {
      toast.add({
        title: t('chat.pins.full', { max: pinLimit.value }),
        description: t('chat.pins.fullHint'),
        color: 'warning',
        icon: 'i-lucide-pin',
      });
      return false;
    }
    const saved = await setPins(next.map(pinTarget));
    if (saved && existing) {
      toast.add({ title: t('chat.pins.removed', { name: existing.name }), color: 'success', icon: 'i-lucide-pin-off' });
    }
    if (saved && !existing) {
      const added = pins.value.find((pin) => key(pin) === key(target));
      toast.add({ title: t('chat.pins.added', { name: added?.name ?? '' }), color: 'success', icon: 'i-lucide-pin' });
    }
    return saved;
  }

  /** Idempotent first load; a return to `/chat` keeps the stored thread and messages. */
  async function init(): Promise<void> {
    if (!threadsLoaded.value) await loadThreads();
    if (!pinsLoaded.value) await loadPins();
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

  /** Stops the in-flight turn and drops what was queued behind it; the thread is reloaded from the database. */
  function stop(): void {
    queue.value = [];
    aborter.value?.abort();
  }

  /** Queue one turn; `threadId` is the conversation it was composed in (null: a new thread). */
  function enqueue(body: Record<string, unknown>, threadId: number | null = activeThreadId.value): void {
    queue.value = [...queue.value, { body, threadId }];
    void pump();
  }

  /** Runs queued turns one at a time; `sending` covers the whole drain, not a single turn. */
  async function pump(): Promise<void> {
    if (pumping) return;
    pumping = true;
    sending.value = true;
    try {
      while (queue.value.length) {
        const next = queue.value[0];
        if (!next) break;
        queue.value = queue.value.slice(1);
        runningRetry = typeof next.body.retryOf === 'number' ? next.body.retryOf : null;
        try {
          // A turn composed in a brand-new thread joins the thread the previous turn adopted.
          await runTurn(next.threadId ?? activeThreadId.value, next.body);
        } finally {
          runningRetry = null;
        }
      }
    } finally {
      pumping = false;
      sending.value = false;
    }
  }

  /**
   * One streamed turn. The provider's fragments update `live`; the terminal frame replaces the
   * transcript with the canonical rows. A turn the owner navigated away from still finishes in
   * the store and reports through a toast, exactly like the non-streaming path did.
   */
  async function runTurn(requestThreadId: number | null, body: Record<string, unknown>): Promise<void> {
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
      const errorText = terminal.error ? formatChatError(terminal.error, t) : null;
      setPending(terminal.thread.id, terminal.pending);
      if (adopt) {
        activeThreadId.value = terminal.thread.id;
        messages.value = terminal.messages;
        // The failed user message carries the reason; only an error without one needs the inline box.
        loadError.value = terminal.messages.some((message) => message.error) ? null : errorText;
      }
      notify(outcome.toast, terminal, errorText);
    } catch (error) {
      if (controller.signal.aborted) {
        // Stop or a closed tab: the database is the truth, no half-answer stays on screen.
        const reload = threadToReloadAfterAbort(activeThreadId.value, adoptedThreadId);
        if (reload != null) await openThread(reload).catch(() => undefined);
        return;
      }
      const message = error instanceof Error ? formatChatError(error.message, t) : t('chat.failedDescription');
      showFailure(message);
    } finally {
      streaming.value = false;
      live.value = null;
      aborter.value = null;
      // `sending` stays true through the thread-list refresh; thread switching stays allowed.
      await loadThreads().catch(() => undefined);
    }
  }

  async function send(
    message: string,
    files: ChatAttachmentInput[] = [],
    refs: ChatSendRef[] = [],
  ): Promise<void> {
    const text = message.trim();
    if (!text && files.length === 0) return;
    enqueue({
      message: text,
      ...(files.length ? { files } : {}),
      ...(refs.length ? { refs } : {}),
    });
  }

  /** Re-runs a failed user message in place; the server reuses its row and discards the failed attempt. */
  async function retry(messageId: number): Promise<void> {
    if (runningRetry === messageId || queue.value.some((item) => item.body.retryOf === messageId)) return;
    const target = messages.value.find((message) => message.id === messageId && message.role === 'user');
    if (!target) return;
    enqueue({ retryOf: messageId }, target.threadId);
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
    enqueue({ message: t('chat.confirmed'), confirm: { toolName: write.toolName, args: write.args } }, threadId);
  }

  async function declinePending(): Promise<void> {
    const write = pending.value;
    const threadId = activeThreadId.value;
    if (!write || threadId == null) return;
    setPending(threadId, null);
    enqueue({ message: t('chat.declined'), decline: { toolName: write.toolName } }, threadId);
  }

  return {
    threads,
    activeThreadId,
    messages,
    pendingByThread,
    sending,
    queued,
    streaming,
    live,
    loadError,
    activeThread,
    pending,
    pins,
    pinLimit,
    pinsLoading,
    pinsError,
    init,
    loadThreads,
    loadPins,
    setPins,
    togglePin,
    openThread,
    newThread,
    send,
    retry,
    stop,
    deleteThread,
    confirmPending,
    declinePending,
  };
});
