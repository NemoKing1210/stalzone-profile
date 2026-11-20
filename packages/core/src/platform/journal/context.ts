import { AsyncLocalStorage } from 'node:async_hooks';

/** Request-scoped facts a journal entry should carry even when the writer does not pass them. */
export interface EventContext {
  /** Trace id of the HTTP request, the same one `log_entry.request_id` stores. */
  requestId?: string | null;
  /** Client/session origin. HTTP writes set `http` (session) or `api` (bearer token). */
  origin?: string | null;
}

const storage = new AsyncLocalStorage<EventContext>();

/**
 * Runs `fn` with the context `logEvent` reads. HTTP writes set it once in `handleWrite`;
 * writers outside a request (MCP, CLI, tests) simply have no context and store NULL.
 */
export function runWithEventContext<T>(context: EventContext, fn: () => T): T {
  const parent = storage.getStore();
  return storage.run({ ...parent, ...context }, fn);
}

export function currentEventContext(): EventContext | null {
  return storage.getStore() ?? null;
}
