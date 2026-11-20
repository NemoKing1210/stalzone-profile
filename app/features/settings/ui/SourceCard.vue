<script setup lang="ts">
import type { SourceDiagnostic } from '@profile/shared/contracts';
import { ProfilePane } from '~/shared/ui';
import { minutesSince, recordMetricKey, sourceFreshness, sourceJumpPath, sourceKey } from '../model/sources';

const props = defineProps<{
  source: SourceDiagnostic;
  busy: boolean;
  syncable: boolean;
  disabledHint: string | null;
  now: number | null;
}>();

const emit = defineEmits<{ sync: [] }>();

const { t } = useI18n();
const { formatAge, formatDate, num } = useFormat();

const title = computed(() => t(sourceKey(props.source.id, 'title')));
const description = computed(() => t(sourceKey(props.source.id, 'description')));
const updates = computed(() => t(sourceKey(props.source.id, 'updates')));

const kindLabel = computed(() => {
  const key = `settings.sources.kind.${props.source.kind}`;
  const label = t(key);
  return label === key ? props.source.kind : label;
});

const statusLabel = computed(() => t(`settings.sources.status.${props.source.status}`));

const statusClass: Record<string, string> = {
  ok: 'border-[var(--sz-success)] text-[var(--sz-success-text)]',
  stale: 'border-[var(--sz-warning)] text-[var(--sz-warning-text)]',
  error: 'border-[var(--sz-danger)] text-[var(--sz-danger-text)]',
  idle: 'border-[var(--sz-border)] text-[var(--sz-text-muted)]',
};

/** Relative ages need a client clock; before mount the absolute date keeps SSR deterministic. */
function ageValue(iso: string | null): string {
  if (!iso) return t('settings.sources.never');
  if (props.now == null) return formatDate(iso);
  return formatAge(minutesSince(iso, props.now));
}

const commitShort = computed(() => (props.source.commit ? props.source.commit.slice(0, 8) : null));
const freshness = computed(() => sourceFreshness(props.source.lastOkAt, props.now));
const freshnessClass: Record<string, string> = {
  fresh: 'text-[var(--sz-success-text)]',
  ageing: 'text-[var(--sz-warning-text)]',
  stale: 'text-[var(--sz-danger-text)]',
  never: 'text-[var(--sz-text-dim)]',
};
const freshnessColor: Record<string, string> = {
  fresh: 'var(--sz-success)',
  ageing: 'var(--sz-warning)',
  stale: 'var(--sz-danger)',
  never: 'var(--sz-border-strong)',
};
const recordsValue = computed(() =>
  props.source.records == null ? t('settings.sources.recordsNone') : num(props.source.records),
);
const metricLabel = computed(() => {
  const key = recordMetricKey(props.source.recordMetric);
  return key ? t(key) : t('settings.sources.records');
});
const jumpPath = computed(() => sourceJumpPath(props.source.id));
const updatedLabel = computed(() =>
  props.source.lastOkAt == null
    ? t('settings.sources.never')
    : t('settings.sources.updatedAgo', { age: ageValue(props.source.lastOkAt) }),
);
</script>

<template>
  <ProfilePane
    :label="title"
    class="border-l-2"
    :style="{ borderLeftColor: freshnessColor[freshness] }"
  >
    <template #header>
      <div class="flex min-w-0 flex-wrap items-center gap-1.5">
        <h2 class="sz-caps truncate text-[var(--sz-text)]">{{ title }}</h2>
        <span
          class="inline-flex border border-[var(--sz-border)] px-1.5 py-0.5 text-[11px] leading-none text-[var(--sz-text-muted)]"
        >
          {{ kindLabel }}
        </span>
        <span
          class="inline-flex border px-1.5 py-0.5 text-[11px] leading-none"
          :class="statusClass[source.status] ?? statusClass.idle"
        >
          {{ statusLabel }}
        </span>
        <span
          class="text-[11px] leading-none"
          :class="freshnessClass[freshness]"
          :title="t(`settings.sources.freshness.${freshness}`)"
        >
          {{ updatedLabel }}
        </span>
      </div>
    </template>

    <template #actions>
      <UButton
        v-if="source.id !== 'local'"
        :label="t('settings.sources.syncNow')"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        size="xs"
        :loading="busy"
        :disabled="!syncable || busy"
        :title="disabledHint ?? undefined"
        @click="emit('sync')"
      />
      <UButton
        :to="jumpPath"
        icon="i-lucide-arrow-up-right"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="t('settings.sources.openData')"
        :title="t('settings.sources.openData')"
      />
    </template>

    <p class="text-[12.5px] leading-relaxed">{{ description }}</p>
    <p class="mt-1.5 text-[12px] leading-relaxed text-[var(--sz-text-muted)]">
      <span class="sz-caps text-[11px]">{{ t('settings.sources.updatesLabel') }}</span>
      {{ updates }}
    </p>

    <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
      <dt class="sz-caps text-[11px] text-[var(--sz-text-muted)]">{{ t('settings.sources.lastOk') }}</dt>
      <dd :title="source.lastOkAt ? formatDate(source.lastOkAt) : undefined">{{ ageValue(source.lastOkAt) }}</dd>

      <dt class="sz-caps text-[11px] text-[var(--sz-text-muted)]">{{ t('settings.sources.lastTry') }}</dt>
      <dd :title="source.lastTryAt ? formatDate(source.lastTryAt) : undefined">{{ ageValue(source.lastTryAt) }}</dd>

      <template v-if="source.records != null">
        <dt class="sz-caps text-[11px] text-[var(--sz-text-muted)]">{{ metricLabel }}</dt>
        <dd class="tabular-nums">{{ recordsValue }}</dd>
      </template>

      <template v-if="source.commit">
        <dt class="sz-caps text-[11px] text-[var(--sz-text-muted)]">{{ t('settings.sources.commit') }}</dt>
        <dd class="font-mono text-[11px]">
          {{ commitShort }}<span v-if="source.commitDate" class="ml-2 text-[var(--sz-text-muted)]">{{ formatDate(source.commitDate) }}</span>
        </dd>
      </template>

      <template v-if="source.url">
        <dt class="sz-caps text-[11px] text-[var(--sz-text-muted)]">{{ t('settings.sources.origin') }}</dt>
        <dd class="min-w-0 break-all">
          <a
            :href="source.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[var(--sz-accent)] underline decoration-dotted underline-offset-2"
          >
            {{ source.url }}
          </a>
        </dd>
      </template>

      <template v-if="source.lastError">
        <dt class="sz-caps text-[11px] text-[var(--sz-text-muted)]">{{ t('settings.sources.lastError') }}</dt>
        <dd class="break-words text-[var(--sz-danger-text)]">{{ source.lastError }}</dd>
      </template>
    </dl>
  </ProfilePane>
</template>
