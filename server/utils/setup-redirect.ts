export interface SetupRedirectInput {
  method: string;
  path: string;
  accept: string;
  authenticated: boolean;
  hasCharacter: boolean;
}

const NEVER_REDIRECT = new Set(['/setup', '/login', '/favicon.ico']);

/** API calls, framework assets and icons must answer as themselves, never with a page redirect. */
function isFrameworkPath(path: string): boolean {
  return path.startsWith('/api/') || path.startsWith('/_') || path.startsWith('/icons/');
}

/** True when an authenticated browser navigation should land on the setup wizard. */
export function shouldRedirectToSetup(input: SetupRedirectInput): boolean {
  if (!input.authenticated || input.hasCharacter) return false;
  if (input.method.toUpperCase() !== 'GET') return false;
  if (!input.accept.toLowerCase().includes('text/html')) return false;
  return !NEVER_REDIRECT.has(input.path) && !isFrameworkPath(input.path);
}

/** True when an owner who already has a character opens the wizard directly. */
export function shouldLeaveSetup(input: { path: string; hasCharacter: boolean }): boolean {
  return input.path === '/setup' && input.hasCharacter;
}
