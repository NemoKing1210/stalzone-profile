import type { ChatTurnResult } from '@profile/shared/contracts';

/** What the owner sees after a turn: the reply, a confirmation, an error, or nothing extra. */
export type TurnToast = 'reply' | 'pending' | 'error' | null;

export interface TurnOutcome {
  /** Apply the result to the open conversation; otherwise leave the current thread untouched. */
  apply: boolean;
  toast: TurnToast;
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
