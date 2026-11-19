import { isTruthy, ingestClientLogs, loginClientKey } from '@profile/core';
import { CLIENT_LOG_BATCH_MAX_BYTES, ClientLogBatchSchema } from '@profile/shared/contracts';
import { requireOrigin } from '../../../utils/auth';
import { isClientBatchTooLarge } from '../../../utils/client-log';
import { useDb } from '../../../utils/db';
import { apiError, validationError } from '../../../utils/errors';
import { fixedWindowLimiter } from '../../../utils/log-limit';
import { readJsonBodyResult } from '../../../utils/read-body';

const limiter = fixedWindowLimiter(120, 60_000);

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const read = await readJsonBodyResult(event, CLIENT_LOG_BATCH_MAX_BYTES);
  if (read.error) return read.error;
  const body = read.body;
  const parsed = ClientLogBatchSchema.safeParse(body);
  if (!parsed.success) return validationError(event, parsed.error);
  if (isClientBatchTooLarge(body)) {
    return apiError(
      event,
      413,
      'CLIENT_LOG_BATCH_TOO_LARGE',
      `A client log batch must stay under ${CLIENT_LOG_BATCH_MAX_BYTES} bytes`,
    );
  }

  const entries = parsed.data.entries;
  const config = useRuntimeConfig();
  const key = loginClientKey(
    getRequestIP(event),
    getRequestHeader(event, 'x-forwarded-for'),
    isTruthy(config.trustProxy),
  );
  if (!limiter.take(key, entries.length)) {
    return apiError(event, 429, 'CLIENT_LOG_RATE_LIMITED', 'Too many client log entries');
  }

  const result = ingestClientLogs(useDb(), entries);
  setResponseStatus(event, result.accepted ? 202 : 204);
  return result.accepted ? result : null;
});
