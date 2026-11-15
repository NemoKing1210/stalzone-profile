import { isAuthenticated, sessionExpiresAt } from '../../utils/auth';

export default defineEventHandler((event) => ({
  authenticated: isAuthenticated(event),
  expiresAt: sessionExpiresAt(event),
}));
