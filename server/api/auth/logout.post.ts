import { clearAuthSession, requireOrigin } from '../../utils/auth';

export default defineEventHandler((event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;
  clearAuthSession(event);
  return { ok: true };
});
