import type { H3Event } from 'h3';
import { WriteError } from '@profile/core';
import { requireSession } from './auth';
import { apiError, type ApiErrorBody } from './errors';

/** Runs a core write and turns its domain error into the standard API envelope. */
export function handleWrite<T>(event: H3Event, write: () => T): T | ApiErrorBody {
  const denied = requireSession(event);
  if (denied) return denied;
  try {
    return write();
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
    return await write();
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
