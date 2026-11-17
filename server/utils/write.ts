import type { H3Event } from 'h3';
import { WriteError } from '@dossier/core';
import { apiError, type ApiErrorBody } from './errors';

/** Runs a core write and turns its domain error into the standard API envelope. */
export function handleWrite<T>(event: H3Event, write: () => T): T | ApiErrorBody {
  try {
    return write();
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
