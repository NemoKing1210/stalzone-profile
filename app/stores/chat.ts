import { defineStore } from 'pinia';
import type {
  ChatMessage,
  ChatPendingWrite,
  ChatThread,
  ChatThreadRead,
  ChatTurnResult,
} from '@profile/shared/contracts';

import { chatHttpStatus, turnOutcome, type TurnToast } from '~/shared/lib/chatTurnOutcome';

/**
 * The assistant conversation lives here, once per SPA: an in-flight turn survives route
 * changes, and a completion that lands off `/chat` is reported by a toast instead of being
 * lost with the unmounted page.
 */
export const useChatStore = defineStore('chat', () => {
  const { t } = useI18n();
  const { message: apiMessage } = useApiError();
  const toast = useToast();
  const route = useRoute();

  /** Provider failures arrive as `AI_HTTP_<status>`; everything else is already readable. */
  function formatTurnError(raw: string): string {
    const status = chatHttpStatus(raw);
    return status ? t('chat.providerHttpError', { status }) : raw;
  }

  const threads = ref<ChatThread[]>([]);
  const activeThreadId = ref<number | null>(null);
  const messages = ref<ChatMessage[]>([]);
  /** A confirmation belongs to its thread; switching away and back restores it. */
  const pendingByThread = ref<Record<number, ChatPendingWrite | null>>({});
  const sending = ref(false);
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
    const read = await $fetch<ChatThreadRead>(`/api/v1/chat/threads/${id}`);
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

  async function turn(body: Record<string, unknown>): Promise<void> {
    if (sending.value) return;
    sending.value = true;
    const requestThreadId = activeThreadId.value;
    const navigationAtRequest = navigation;
    loadError.value = null;
    try {
      const result = await $fetch<ChatTurnResult>('/api/v1/chat/turn', {
        method: 'POST',
        body: { threadId: requestThreadId ?? undefined, ...body },
      });
      const outcome = turnOutcome(result, activeThreadId.value, route.path);
      // A brand-new thread may adopt its id only when the owner did not start another one.
      const adopt = outcome.apply && (requestThreadId != null || navigation === navigationAtRequest);
      const errorText = result.error ? formatTurnError(result.error) : null;
      setPending(result.thread.id, result.pending);
      if (adopt) {
        activeThreadId.value = result.thread.id;
        messages.value = result.messages;
        // The open conversation shows the provider failure inline; it was silent before.
        loadError.value = errorText;
      }
      notify(outcome.toast, result, errorText);
    } catch (error) {
      const data =
        error && typeof error === 'object' && 'data' in error
          ? (error as { data?: { error?: { code?: string; message?: string } } }).data
          : undefined;
      const message = apiMessage(data?.error?.code, data?.error?.message || t('chat.failedDescription'));
      if (activeThreadId.value === requestThreadId) loadError.value = message;
      toast.add({
        title: t('chat.failed'),
        description: message,
        color: 'error',
        icon: 'i-lucide-triangle-alert',
      });
    } finally {
      // `sending` stays true through the thread-list refresh; thread switching stays allowed.
      await loadThreads().catch(() => undefined);
      sending.value = false;
    }
  }

  async function send(message: string): Promise<void> {
    const text = message.trim();
    if (!text) return;
    await turn({ message: text });
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
    loadError,
    activeThread,
    pending,
    init,
    loadThreads,
    openThread,
    newThread,
    send,
    confirmPending,
    declinePending,
  };
});
