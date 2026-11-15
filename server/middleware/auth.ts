import { apiError } from '../utils/errors';
import { isAuthenticated } from '../utils/auth';

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/v1/healthz', '/mcp']);

export default defineEventHandler((event) => {
  const url = getRequestURL(event);
  const path = url.pathname;

  if (PUBLIC_PATHS.has(path)) return;
  // Framework assets, payloads and icons are not private data.
  if (path.startsWith('/_') || path.startsWith('/icons/') || path === '/favicon.ico') return;

  if (isAuthenticated(event)) return;

  if (path.startsWith('/api/')) {
    return apiError(event, 401, 'UNAUTHORIZED', 'Требуется вход');
  }

  const next = `${path}${url.search}`;
  return sendRedirect(event, `/login?next=${encodeURIComponent(next)}`, 302);
});
