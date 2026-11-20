import {
  DEFAULT_DENSITY,
  DEFAULT_FONT,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DENSITIES,
  NOTIFICATION_DURATIONS,
  NOTIFICATION_POSITIONS,
  UI_FONTS,
  normalizeDensity,
  normalizeFont,
  normalizeNotificationDuration,
  normalizeNotificationPosition,
  normalizeNotificationStack,
  notificationToasterProps,
  persistDensity,
  persistFont,
  persistNotifications,
  readStoredDensity,
  readStoredFont,
  readStoredNotifications,
  type DensityId,
  type NotificationPreferences,
  type UiFontId,
} from '../lib/appearance';

/**
 * Presentation choices shared across the shell: interface font, density and notification
 * preferences. The server renders the defaults and the inline head script restores font
 * and density before the first paint; state is loaded in `onMounted` so the first client
 * render still matches the SSR markup.
 *
 * `toasterProps` is the one-line hook for `UApp` in `app.vue`:
 * `<UApp :toaster="toasterProps">`.
 */
export function useAppearance() {
  const font = useState<UiFontId>('ui-font', () => DEFAULT_FONT);
  const density = useState<DensityId>('ui-density', () => DEFAULT_DENSITY);
  const notifications = useState<NotificationPreferences>('notifications', () => ({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  }));

  function applyChrome(): void {
    if (!import.meta.client) return;
    try {
      const root = document.documentElement;
      root.dataset.font = font.value;
      root.dataset.density = density.value;
    } catch {
      /* no document in non-browser environments */
    }
  }

  function storage(): Storage | null {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function setFont(value: unknown): void {
    font.value = normalizeFont(value);
    applyChrome();
    if (import.meta.client) persistFont(storage(), font.value);
  }

  function setDensity(value: unknown): void {
    density.value = normalizeDensity(value);
    applyChrome();
    if (import.meta.client) persistDensity(storage(), density.value);
  }

  function commitNotifications(next: NotificationPreferences): void {
    notifications.value = next;
    if (import.meta.client) persistNotifications(storage(), next);
  }

  function setNotificationPosition(value: unknown): void {
    commitNotifications({
      ...notifications.value,
      position: normalizeNotificationPosition(value),
    });
  }

  function setNotificationDuration(value: unknown): void {
    commitNotifications({
      ...notifications.value,
      duration: normalizeNotificationDuration(value),
    });
  }

  function setNotificationStack(value: unknown): void {
    commitNotifications({
      ...notifications.value,
      stack: normalizeNotificationStack(value),
    });
  }

  onMounted(() => {
    const store = storage();
    if (!store) return;
    const storedFont = readStoredFont(store);
    const storedDensity = readStoredDensity(store);
    const storedNotifications = readStoredNotifications(store);
    if (storedFont !== font.value) font.value = storedFont;
    if (storedDensity !== density.value) density.value = storedDensity;
    notifications.value = storedNotifications;
    applyChrome();
  });

  const toasterProps = computed(() => notificationToasterProps(notifications.value));

  return {
    font,
    density,
    notifications,
    fonts: UI_FONTS,
    densities: DENSITIES,
    positions: NOTIFICATION_POSITIONS,
    durations: NOTIFICATION_DURATIONS,
    toasterProps,
    setFont,
    setDensity,
    setNotificationPosition,
    setNotificationDuration,
    setNotificationStack,
  };
}
