const TABS: Record<string, string> = {
  overview: '/',
  weapons: '/weapons',
  armor: '/armor',
  containers: '/containers',
  artifacts: '/artifacts',
};

/** Old dossier links (`/?tab=weapons`) keep working after the move to routes. */
export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== '/') return;
  const raw = Array.isArray(to.query.tab) ? to.query.tab[0] : to.query.tab;
  if (typeof raw !== 'string') return;
  const target = TABS[raw] ?? '/';
  if (target === to.path) return;
  return navigateTo(target, { replace: true, redirectCode: 301 });
});
