<script setup lang="ts">
import type { SyncBundleState, SyncSchedule, SyncScheduleValues } from '@profile/shared/contracts';
import { ProfilePane } from '~/shared/ui';
import { INTERVAL_VALUES, nextRunBucket } from '../model/sources';

const props = defineProps<{
  schedule: SyncSchedule;
  bundles: SyncBundleState[];
  profileApiConfigured: boolean;
  saving: boolean;
  now: number | null;
}>();

const emit = defineEmits<{ save: [values: SyncScheduleValues] }>();

const { t } = useI18n();
const { formatDate } = useFormat();

const enabled = ref(props.schedule.enabled);
const catalog = ref(String(props.schedule.catalogEveryMin));
const prices = ref(String(props.schedule.pricesEveryMin));
const profile = ref(String(props.schedule.profileEveryMin));

// Adopt the stored values only when the schedule was actually written. The panel
// polls diagnostics every minute; re-adopting on every poll would silently revert
// edits the owner has not saved yet.
watch(
  () => props.schedule.updatedAt,
  () => {
    enabled.value = props.schedule.enabled;
    catalog.value = String(props.schedule.catalogEveryMin);
    prices.value = String(props.schedule.pricesEveryMin);
    profile.value = String(props.schedule.profileEveryMin);
  },
);

function intervalLabel(value: number): string {
  if (value === 0) return t('settings.sources.intervalOff');
  return value % 60 === 0
    ? t('settings.sources.intervalHours', { count: value / 60 })
    : t('settings.sources.intervalMinutes', { count: value });
}

/** A value written through the API/MCP may be outside the presets; keep it selectable. */
function intervalOptions(current: number) {
  const values = new Set<number>(INTERVAL_VALUES);
  values.add(current);
  return [...values].sort((a, b) => a - b).map((value) => ({ label: intervalLabel(value), value: String(value) }));
}

const catalogOptions = computed(() => intervalOptions(props.schedule.catalogEveryMin));
const pricesOptions = computed(() => intervalOptions(props.schedule.pricesEveryMin));
const profileOptions = computed(() => intervalOptions(props.schedule.profileEveryMin));

const profileHint = computed(() =>
  props.profileApiConfigured ? null : t('settings.sources.reason.profile_credentials'),
);

const bundleRows = computed(() => [
  { id: 'catalog' as const, label: t('settings.sources.catalog'), bundle: props.bundles.find((b) => b.id === 'catalog') },
  { id: 'prices' as const, label: t('settings.sources.prices'), bundle: props.bundles.find((b) => b.id === 'prices') },
  { id: 'profile' as const, label: t('settings.sources.profile'), bundle: props.bundles.find((b) => b.id === 'profile') },
]);

function nextLabel(bundle: SyncBundleState | undefined): string {
  if (!bundle) return t('settings.sources.nextOff');
  if (!bundle.ready) {
    return bundle.reason === 'disabled' || bundle.reason === 'off'
      ? t('settings.sources.nextOff')
      : t('settings.sources.notApplicable');
  }
  if (props.now == null) {
    return bundle.nextRunAt ? formatDate(bundle.nextRunAt) : t('settings.sources.nextOff');
  }
  const bucket = nextRunBucket(bundle.nextRunAt, props.now);
  if (bucket.kind === 'off') return t('settings.sources.nextOff');
  if (bucket.kind === 'due') return t('settings.sources.nextDue');
  return t('settings.sources.nextIn', { count: bucket.minutes });
}

function save(): void {
  emit('save', {
    enabled: enabled.value,
    catalogEveryMin: Number(catalog.value),
    pricesEveryMin: Number(prices.value),
    profileEveryMin: Number(profile.value),
  });
}
</script>

<template>
  <ProfilePane :title="t('settings.sources.autoTitle')">
    <template #actions>
      <UButton
        :label="t('settings.sources.save')"
        icon="i-lucide-save"
        size="xs"
        :loading="saving"
        @click="save"
      />
    </template>

    <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">{{ t('settings.sources.autoText') }}</p>

    <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
      <USwitch v-model="enabled" :label="t('settings.sources.enabled')" />
      <span class="text-[11px] text-[var(--sz-text-muted)]">{{ t('settings.sources.enabledHint') }}</span>
    </div>

    <div class="mt-3 grid gap-3 sm:grid-cols-3">
      <UFormField :label="t('settings.sources.catalog')">
        <USelect v-model="catalog" :items="catalogOptions" class="w-full" />
      </UFormField>
      <UFormField :label="t('settings.sources.prices')">
        <USelect v-model="prices" :items="pricesOptions" class="w-full" />
      </UFormField>
      <UFormField :label="t('settings.sources.profile')">
        <USelect
          v-model="profile"
          :items="profileOptions"
          class="w-full"
          :disabled="!profileApiConfigured"
          :title="profileHint ?? undefined"
        />
      </UFormField>
    </div>

    <p v-if="profileHint" class="mt-1.5 text-[11px] leading-relaxed text-[var(--sz-warning-text)]">
      {{ profileHint }}
    </p>

    <dl class="mt-3 grid gap-1 text-[11.5px] sm:grid-cols-3">
      <div v-for="row in bundleRows" :key="row.id" class="border border-[var(--sz-border)] px-2 py-1.5">
        <dt class="sz-caps text-[10px] text-[var(--sz-text-muted)]">{{ row.label }}</dt>
        <dd>{{ nextLabel(row.bundle) }}</dd>
      </div>
    </dl>

    <p class="mt-3 text-[11px] leading-relaxed text-[var(--sz-text-muted)]">
      {{ t('settings.sources.externalCronBefore')
      }}<NuxtLink
        to="/guide"
        class="text-[var(--sz-accent)] underline decoration-dotted underline-offset-2"
      >{{ t('settings.sources.externalCronLink') }}</NuxtLink>{{ t('settings.sources.externalCronAfter') }}
    </p>
  </ProfilePane>
</template>
