import type { H3Event } from 'h3';
import type { ZodError } from 'zod';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Single error envelope for every `/api/v1` response. */
export function apiError(
  event: H3Event,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): ApiErrorBody {
  setResponseStatus(event, status);
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export function validationError(event: H3Event, error: ZodError): ApiErrorBody {
  return apiError(event, 400, 'VALIDATION', 'Invalid data', error.issues);
}
