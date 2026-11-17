import { LoginSchema } from '@profile/shared';
import { verifyPassword } from '@profile/core';
import { assertLoginAllowed, createSession, requireOrigin } from '../../utils/auth';
import { apiError, validationError } from '../../utils/errors';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const rateError = assertLoginAllowed(event);
  if (rateError) return rateError;

  const parsed = LoginSchema.safeParse(await readBody(event).catch(() => null));
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
