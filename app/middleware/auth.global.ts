export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return;
  if (to.path === '/login') return;

  try {
    const state = await $fetch<{ authenticated: boolean }>('/api/auth/me');
    if (state.authenticated) return;
  } catch {
    /* fall through to the login redirect */
  }

  return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`, { replace: true });
});
