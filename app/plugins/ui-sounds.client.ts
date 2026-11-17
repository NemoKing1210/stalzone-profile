/**
 * Interface click sounds: attach the delegated listeners once the app is in the
 * browser, and read the stored on/off choice after hydration so the SSR markup
 * keeps the defaults and does not mismatch.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { load, attach } = useUiSounds();

  attach();
  nuxtApp.hook('app:mounted', load);
});
