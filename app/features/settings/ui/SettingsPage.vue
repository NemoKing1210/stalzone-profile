<script setup lang="ts">
import { ProfilePane } from '~/shared/ui';
import { DEFAULT_ACCENT } from '~/shared/lib/accents';
import { TAB_STRIP_UI } from '~/shared/lib/tabStrip';
import { SLIDER_MOTION_UI } from '~/shared/lib/motion';
import {
  normalizePaletteShortcut,
  persistPaletteShortcut,
  readPaletteShortcut,
  type PaletteShortcut,
} from '~/shared/lib/paletteShortcut';
import AppearanceChoiceGroup from './AppearanceChoiceGroup.vue';
import LoggingSettingsPanel from './LoggingSettingsPanel.vue';
import SourcesSection from './SourcesSection.vue';
import AssistantSettings from './AssistantSettings.vue';

const { t } = useI18n();
useHead(() => ({ title: `${t('settings.pageTitle')} // ${t('common.appName')}` }));

const { accent, presets, setAccent, resetAccent } = useAccent();
const { settings: soundSettings, play: playSound, setEnabled: setSoundEnabled, setVolume: setSoundVolume } = useUiSounds();
const { theme, setTheme } = useTheme();
const {
  font,
  density,
  notifications,
  fonts,
  densities,
  positions,
  durations,
  setFont,
  setDensity,
  setNotificationPosition,
  setNotificationDuration,
  setNotificationStack,
} = useAppearance();
const toast = useToast();

const soundVolume = computed(() => Math.round(soundSettings.value.volume * 100));

function setSoundVolumePercent(value: number | undefined): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  setSoundVolume(value / 100);
}

const themeOptions = computed(() => [
  { id: 'dark', label: t('settings.themeDark') },
  { id: 'light', label: t('settings.themeLight') },
]);

const fontOptions = computed(() =>
  fonts.map((id) => ({
    id,
    label: id === 'oswald' ? t('settings.fontOswald') : t('settings.fontCondensed'),
  })),
);

const densityOptions = computed(() =>
  densities.map((id) => ({
    id,
    label: id === 'compact' ? t('settings.densityCompact') : t('settings.densityComfortable'),
  })),
);

const paletteShortcut = ref<PaletteShortcut>('both');
const paletteOptions = computed(() => [
  { id: 'both', label: t('settings.paletteBoth') },
  { id: 'ctrl-space', label: t('settings.paletteCtrlSpace') },
  { id: 'ctrl-k', label: t('settings.paletteCtrlK') },
]);

onMounted(() => {
  try {
    paletteShortcut.value = readPaletteShortcut(window.localStorage);
  } catch {
    paletteShortcut.value = 'both';
  }
});

function setPaletteShortcut(value: unknown): void {
  paletteShortcut.value = normalizePaletteShortcut(value);
  if (!import.meta.client) return;
  try {
    persistPaletteShortcut(window.localStorage, paletteShortcut.value);
  } catch {
    /* private mode: the choice applies for this page */
  }
}

const POSITION_LABEL_KEYS: Record<string, string> = {
  'top-left': 'settings.notificationPositionTopLeft',
  'top-center': 'settings.notificationPositionTopCenter',
  'top-right': 'settings.notificationPositionTopRight',
  'bottom-left': 'settings.notificationPositionBottomLeft',
  'bottom-center': 'settings.notificationPositionBottomCenter',
  'bottom-right': 'settings.notificationPositionBottomRight',
};

const positionOptions = computed(() =>
  positions.map((id) => ({
    value: id,
    label: t(POSITION_LABEL_KEYS[id] ?? 'settings.notificationPosition'),
  })),
);

const durationOptions = computed<{ value: number; label: string }[]>(() =>
  durations.map((ms) => ({
    value: ms,
    label: t('settings.notificationSeconds', { seconds: ms / 1000 }),
  })),
);

/** Two notifications show stacking; clearing in between shows the replace mode. */
function previewNotifications(): void {
  const add = (): void => {
    toast.add({
      title: t('settings.notificationPreviewTitle'),
      description: t('settings.notificationPreviewText'),
      duration: notifications.value.duration,
    });
  };

  if (notifications.value.stack === 'replace') toast.clear();
  add();
  if (notifications.value.stack === 'stack') {
    add();
  } else {
    toast.clear();
    add();
  }
}

/** The page owns the tab in the URL and its validation; the screen only renders it. */
const activeTab = defineModel<string>('tab', { default: 'appearance' });

const tabItems = computed(() => [
  { label: t('settings.tabs.appearance'), icon: 'i-lucide-palette', value: 'appearance' },
  { label: t('settings.tabs.sources'), icon: 'i-lucide-cloud', value: 'sources' },
  { label: t('settings.tabs.assistant'), icon: 'i-lucide-sparkles', value: 'assistant' },
  { label: t('settings.tabs.data'), icon: 'i-lucide-database', value: 'data' },
  { label: t('settings.tabs.journal'), icon: 'i-lucide-history', value: 'journal' },
  { label: t('settings.tabs.cleanup'), icon: 'i-lucide-trash-2', value: 'cleanup' },
  { label: t('settings.tabs.logging'), icon: 'i-lucide-bug', value: 'logging' },
]);
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{{ t('settings.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('settings.subtitle') }}</p>
      </div>
    </div>

    <UTabs
      v-model="activeTab"
      :items="tabItems"
      variant="link"
      :ui="TAB_STRIP_UI"
    >
      <template #content="{ item }">
        <div :key="item.value" class="sz-panel-enter">
        <div v-if="item.value === 'appearance'">
          <ProfilePane :title="t('settings.appearanceTitle')">
            <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
              {{ t('settings.appearanceText') }}
            </p>

            <div
              role="radiogroup"
              :aria-label="t('settings.accent')"
              class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5"
            >
              <label
                v-for="preset in presets"
                :key="preset.id"
                class="flex cursor-pointer items-center gap-2 border px-3 py-2 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sz-accent)]"
                :class="
                  accent === preset.id
                    ? 'border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] ring-2 ring-[var(--sz-accent)] ring-inset'
                    : 'border-[var(--sz-border)] hover:bg-[var(--sz-surface-alt)]'
                "
              >
                <input
                  type="radio"
                  name="accent"
                  class="sr-only"
                  :value="preset.id"
                  :checked="accent === preset.id"
                  @change="setAccent(preset.id)"
                >
                <span
                  class="size-5 shrink-0 border border-[var(--sz-border-strong)]"
                  :style="{ backgroundColor: preset.hex }"
                  aria-hidden="true"
                />
                <span class="flex-1 text-[12.5px] font-medium">{{ t(preset.labelKey) }}</span>
                <span v-if="preset.id === DEFAULT_ACCENT" class="sz-caps text-[10px] text-[var(--sz-text-dim)]">
                  {{ t('settings.accentDefault') }}
                </span>
                <UIcon v-if="accent === preset.id" name="i-lucide-check" class="size-4 text-[var(--sz-accent)]" />
              </label>
            </div>

            <div class="mt-3">
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                :label="t('settings.accentReset')"
                @click="resetAccent"
              />
            </div>

            <div class="mt-4 border-t border-[var(--sz-border)] pt-3">
              <h3 class="sz-caps text-[var(--sz-text-muted)]">{{ t('settings.themeTitle') }}</h3>
              <p class="mt-1 text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
                {{ t('settings.themeText') }}
              </p>

              <AppearanceChoiceGroup
                class="mt-3 sm:grid-cols-2"
                name="theme"
                :label="t('settings.themeTitle')"
                :model-value="theme"
                :options="themeOptions"
                @update:model-value="setTheme"
              />
            </div>

            <div class="mt-4 border-t border-[var(--sz-border)] pt-3">
              <h3 class="sz-caps text-[var(--sz-text-muted)]">{{ t('settings.fontTitle') }}</h3>
              <p class="mt-1 text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
                {{ t('settings.fontText') }}
              </p>

              <AppearanceChoiceGroup
                class="mt-3 sm:grid-cols-2"
                name="interface-font"
                :label="t('settings.fontTitle')"
                :model-value="font"
                :options="fontOptions"
                @update:model-value="setFont"
              />
            </div>

            <div class="mt-4 border-t border-[var(--sz-border)] pt-3">
              <h3 class="sz-caps text-[var(--sz-text-muted)]">{{ t('settings.densityTitle') }}</h3>
              <p class="mt-1 text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
                {{ t('settings.densityText') }}
              </p>

              <AppearanceChoiceGroup
                class="mt-3 sm:grid-cols-2"
                name="density"
                :label="t('settings.densityTitle')"
                :model-value="density"
                :options="densityOptions"
                @update:model-value="setDensity"
              />
            </div>

            <div class="mt-4 border-t border-[var(--sz-border)] pt-3">
              <h3 class="sz-caps text-[var(--sz-text-muted)]">{{ t('settings.paletteTitle') }}</h3>
              <p class="mt-1 text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
                {{ t('settings.paletteText') }}
              </p>

              <AppearanceChoiceGroup
                class="mt-3"
                name="palette-shortcut"
                :label="t('settings.paletteTitle')"
                :model-value="paletteShortcut"
                :options="paletteOptions"
                @update:model-value="setPaletteShortcut"
              />
            </div>

            <div class="mt-4 border-t border-[var(--sz-border)] pt-3">
              <h3 class="sz-caps text-[var(--sz-text-muted)]">{{ t('settings.notificationsTitle') }}</h3>
              <p class="mt-1 text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
                {{ t('settings.notificationsText') }}
              </p>

              <div class="mt-3 grid gap-3 sm:grid-cols-2">
                <div class="block">
                  <span class="sz-caps text-[var(--sz-text-muted)]">{{ t('settings.notificationPosition') }}</span>
                  <USelect
                    class="mt-1 w-full"
                    :model-value="notifications.position"
                    :items="positionOptions"
                    :aria-label="t('settings.notificationPosition')"
                    @update:model-value="setNotificationPosition"
                  />
                </div>
                <div class="block">
                  <span class="sz-caps text-[var(--sz-text-muted)]">{{ t('settings.notificationDuration') }}</span>
                  <USelect
                    class="mt-1 w-full"
                    :model-value="notifications.duration"
                    :items="durationOptions"
                    :aria-label="t('settings.notificationDuration')"
                    @update:model-value="setNotificationDuration"
                  />
                </div>
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
                <USwitch
                  :model-value="notifications.stack === 'stack'"
                  :label="t('settings.notificationStack')"
                  @update:model-value="(value) => setNotificationStack(value ? 'stack' : 'replace')"
                />
                <UButton
                  :label="t('settings.notificationPreview')"
                  icon="i-lucide-bell"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  @click="previewNotifications"
                />
              </div>
              <p class="mt-1 text-[11px] leading-relaxed text-[var(--sz-text-dim)]">
                {{ t('settings.notificationStackHint') }}
              </p>
            </div>

            <div class="mt-4 border-t border-[var(--sz-border)] pt-3">
              <h3 class="sz-caps text-[var(--sz-text-muted)]">{{ t('settings.soundsTitle') }}</h3>
              <p class="mt-1 text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
                {{ t('settings.soundsText') }}
              </p>

              <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
                <USwitch
                  :model-value="soundSettings.enabled"
                  :label="t('settings.soundsEnabled')"
                  @update:model-value="(value) => setSoundEnabled(Boolean(value))"
                />

                <div class="flex items-center gap-2">
                  <span class="text-[12px] text-[var(--sz-text-muted)]">{{ t('settings.soundsVolume') }}</span>
                  <USlider
                    :ui="SLIDER_MOTION_UI"
                    :model-value="soundVolume"
                    class="w-32"
                    :aria-label="t('settings.soundsVolume')"
                    :aria-valuetext="`${soundVolume}%`"
                    :disabled="!soundSettings.enabled"
                    @update:model-value="setSoundVolumePercent"
                  />
                  <span class="w-9 font-mono text-[11px] tabular-nums text-[var(--sz-text-muted)]">
                    {{ soundVolume }}%
                  </span>
                </div>

                <UButton
                  :label="t('settings.soundsPreview')"
                  icon="i-lucide-volume-2"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :disabled="!soundSettings.enabled"
                  data-no-ui-sounds
                  @click="playSound('tap')"
                />
              </div>
            </div>
          </ProfilePane>
        </div>

        <SourcesSection v-else-if="item.value === 'sources'" />
        <AssistantSettings v-else-if="item.value === 'assistant'" />

        <div v-else-if="item.value === 'data'" class="grid gap-4 lg:grid-cols-2">
          <ProfilePane :title="t('settings.exportTitle')" dense>
            <p class="text-[12.5px] text-[var(--sz-text-muted)]">
              {{ t('settings.exportText') }}
            </p>
            <div class="mt-3">
              <UButton
                to="/api/v1/admin/export"
                external
                icon="i-lucide-download"
                color="neutral"
                variant="outline"
                size="sm"
                :label="t('settings.downloadJson')"
              />
            </div>
          </ProfilePane>

          <ProfilePane :title="t('settings.backupsTitle')" dense>
            <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
              {{ t('settings.backupsBefore') }}<code class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-1 font-mono text-[11px]">npm run backup</code>{{ t('settings.backupsAfter') }}
            </p>
          </ProfilePane>

          <ProfilePane :title="t('settings.accessTitle')" dense>
            <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
              {{ t('settings.accessBefore') }}<code class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-1 font-mono text-[11px]">NUXT_PASSWORD_HASH</code>{{ t('settings.accessBetween') }}<code class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-1 font-mono text-[11px]">NUXT_PASSWORD</code>{{ t('settings.accessAfter') }}
            </p>
          </ProfilePane>
        </div>

        <div v-else-if="item.value === 'journal'">
          <slot name="journal" />
        </div>

        <div v-else-if="item.value === 'cleanup'">
          <slot name="cleanup" />
        </div>

        <div v-else-if="item.value === 'logging'">
          <LoggingSettingsPanel />
        </div>
        </div>
      </template>
    </UTabs>
  </section>
</template>
