import { LoginSchema } from '@profile/shared';
import { verifyPassword } from '@profile/core';
import { assertLoginAllowed, createSession, requireOrigin } from '../../utils/auth';
import { apiError, validationError } from '../../utils/errors';
import { readJsonBodyResult } from '../../utils/read-body';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const rateError = assertLoginAllowed(event);
  if (rateError) return rateError;

  const read = await readJsonBodyResult(event);
  if (read.error) return read.error;
  const parsed = LoginSchema.safeParse(read.body);
  if (!parsed.success) return validationError(event, parsed.error);

  const config = useRuntimeConfig();
  const valid = verifyPassword(parsed.data.password, {
    passwordHash: config.passwordHash,
    password: config.password,
  });
  if (!valid) return apiError(event, 401, 'INVALID_PASSWORD', 'Incorrect password');

  createSession(event);
  return { ok: true };
});
