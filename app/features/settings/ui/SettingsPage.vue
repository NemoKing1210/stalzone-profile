<script setup lang="ts">
import { ProfilePane } from '~/shared/ui';
import { DEFAULT_ACCENT } from '~/shared/lib/accents';
import SourcesSection from './SourcesSection.vue';

const { t } = useI18n();
useHead(() => ({ title: `${t('settings.pageTitle')} // ${t('common.appName')}` }));

const { accent, presets, setAccent, resetAccent } = useAccent();
const { settings: soundSettings, play: playSound, setEnabled: setSoundEnabled, setVolume: setSoundVolume } = useUiSounds();

const soundVolume = computed(() => Math.round(soundSettings.value.volume * 100));

function setSoundVolumePercent(value: number | undefined): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  setSoundVolume(value / 100);
}

/** The page owns the tab in the URL and its validation; the screen only renders it. */
const activeTab = defineModel<string>('tab', { default: 'appearance' });

const tabItems = computed(() => [
  { label: t('settings.tabs.appearance'), icon: 'i-lucide-palette', value: 'appearance' },
  { label: t('settings.tabs.sources'), icon: 'i-lucide-cloud', value: 'sources' },
  { label: t('settings.tabs.data'), icon: 'i-lucide-database', value: 'data' },
  { label: t('settings.tabs.journal'), icon: 'i-lucide-history', value: 'journal' },
  { label: t('settings.tabs.cleanup'), icon: 'i-lucide-trash-2', value: 'cleanup' },
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
      :ui="{
        root: 'gap-0',
        list: 'gap-0 overflow-x-auto overflow-y-clip [overflow-clip-margin:1px] border-b border-[var(--sz-border)]',
        trigger: 'sz-caps rounded-none px-3 py-2.5 text-[var(--sz-text-muted)] hover:text-[var(--sz-text)]',
        content: 'p-0 pt-4',
      }"
    >
      <template #content="{ item }">
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
      </template>
    </UTabs>
  </section>
</template>
