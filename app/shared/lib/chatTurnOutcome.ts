import type { ChatTurnResult } from '@profile/shared/contracts';

/** What the owner sees after a turn: the reply, a confirmation, an error, or nothing extra. */
export type TurnToast = 'reply' | 'pending' | 'error' | null;

export interface TurnOutcome {
  /** Apply the result to the open conversation; otherwise leave the current thread untouched. */
  apply: boolean;
  toast: TurnToast;
}

/** The status in an `AI_HTTP_<status>` provider error, or null for any other message. */
export function chatHttpStatus(error: string): string | null {
  return /^AI_HTTP_(\d{3})$/.exec(error)?.[1] ?? null;
}

export type ChatErrorTranslator = (key: string, named?: Record<string, unknown>) => string;

/**
 * One error string for both the store (toast/inline) and a stored failed message, so a reload
 * shows the same wording as the live failure.
 */
export function formatChatError(raw: string, t: ChatErrorTranslator): string {
  const status = chatHttpStatus(raw);
  if (status) return t('chat.providerHttpError', { status });
  if (raw.startsWith('AI_EMPTY')) return t('chat.emptyReply');
  if (raw.startsWith('AI_NOT_CONFIGURED')) {
    const env = raw.includes('set ') ? raw.slice(raw.indexOf('set ') + 4).trim() : '';
    return env ? t('chat.notConfigured', { env }) : t('chat.failedDescription');
  }
  // A network/timeout failure has no product code; the provider's raw `fetch failed` is noise.
  return raw.startsWith('AI_') ? raw : t('chat.failedDescription');
}

/**
 * The apply/toast decision for one assistant turn. The result belongs to the active thread
 * when that thread is still open, or to a brand-new thread (`activeThreadId === null`).
 * A pending write outranks an error, which outranks a plain reply; the open `/chat` page
 * shows the same state inline, so it never also gets a toast.
 */
export function turnOutcome(
  result: ChatTurnResult,
  activeThreadId: number | null,
  routePath: string,
): TurnOutcome {
  const isActive = activeThreadId == null || result.thread.id === activeThreadId;
  const onChat = routePath === '/chat' || routePath.startsWith('/chat/') || routePath.startsWith('/chat?');
  const toast: TurnToast =
    isActive && onChat ? null : result.pending ? 'pending' : result.error ? 'error' : 'reply';
  return { apply: isActive, toast };
}
