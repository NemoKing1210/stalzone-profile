import { getRouterParam, type H3Event } from 'h3';
import { WriteError, runWithEventContext, type EventContext } from '@profile/core';
import { hasValidBearer, requireSession } from './auth';
import { apiError, type ApiErrorBody } from './errors';

/**
 * Facts every HTTP write attaches to its journal entry: the request id shared with
 * `log_entry`/`x-request-id`, and whether the caller used the session or the bearer token.
 */
export function requestEventContext(event: H3Event): EventContext {
  return {
    requestId: (event.context.requestId as string | undefined) ?? null,
    origin: hasValidBearer(event) ? 'api' : 'http',
  };
}

/** Runs a core write and turns its domain error into the standard API envelope. */
export function handleWrite<T>(event: H3Event, write: () => T): T | ApiErrorBody {
  const denied = requireSession(event);
  if (denied) return denied;
  try {
    return runWithEventContext(requestEventContext(event), write);
  } catch (error) {
    if (error instanceof WriteError) {
      return apiError(event, error.status, error.code, error.message, error.details);
    }
    throw error;
  }
}

/** Same envelope as `handleWrite`, for writes that await a lock or a source. */
export async function handleWriteAsync<T>(
  event: H3Event,
  write: () => Promise<T>,
): Promise<T | ApiErrorBody> {
  const denied = requireSession(event);
  if (denied) return denied;
  try {
    return await runWithEventContext(requestEventContext(event), write);
  } catch (error) {
    if (error instanceof WriteError) {
      return apiError(event, error.status, error.code, error.message, error.details);
    }
    throw error;
  }
}

export function parseId(event: H3Event): number | null {
  const id = Number(getRouterParam(event, 'id'));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
