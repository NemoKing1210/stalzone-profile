import { PiniaColada } from '@pinia/colada';

/** One query cache for the app; installed after Pinia by the Nuxt module. */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(PiniaColada, {
    // The auth middleware is client-only; an anonymous SSR request must still render the
    // shell and let the middleware redirect, not fail the page with the API's 401.
    queryOptions: { ssrCatchError: true },
  });
});
