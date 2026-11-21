/**
 * Provider availability for the chat header. `disabled` is not a failure: the assistant
 * has no usable key at all, so nothing can be sent until Settings changes. `error` is a
 * configured provider that answered the model-list probe with a failure.
 */
export type ChatProviderState = 'unknown' | 'disabled' | 'checking' | 'online' | 'error';

export interface ChatProviderOutcome {
  ok: boolean;
}

/**
 * Resolves the badge from the settings read and the last list-models probe. Settings that
 * did not load stay `unknown`; no answer yet is `checking`; the last answer stays visible
 * while a refresh runs, so a periodic poll does not blink the badge.
 */
export function chatProviderState(
  settings: { enabled: boolean } | null,
  outcome: ChatProviderOutcome | null,
): ChatProviderState {
  if (!settings) return 'unknown';
  if (!settings.enabled) return 'disabled';
  if (!outcome) return 'checking';
  return outcome.ok ? 'online' : 'error';
}
