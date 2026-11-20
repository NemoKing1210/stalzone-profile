<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import { ConfirmActionModal, ProfilePane } from '~/shared/ui';
import { QUERY_KEYS } from '~/stores/keys';

import type { CleanupCounts, CleanupScope } from '@profile/shared/contracts';
import { cleanupCountsView } from '../model/cleanupCounts';

interface ResetCard {
  scope: CleanupScope;
  icon: string;
  title: string;
  text: string;
  count: string;
  action: string;
  disabled: boolean;
  danger?: boolean;
}

interface Confirmation {
  label: string;
  description: string;
  requireText?: string;
}

const { t } = useI18n();
const { write, busy: writeBusy } = useWrite();

const {
  data: counts,
  status: countsStatus,
  refetch: refreshCounts,
} = useQuery({
  key: QUERY_KEYS.cleanup,
  query: () => $fetch<CleanupCounts>('/api/v1/admin/cleanup'),
  enabled: false,
});
onMounted(() => void refreshCounts());

const view = computed(() => cleanupCountsView(countsStatus.value, counts.value));

/** Missing counts show a dash: zero is a real measurement and never stands in for it. */
function count(key: string, params: Record<string, string | number> = {}): string {
  return view.value.known ? t(key, params) : '—';
}

const characterLabel = computed(() => {
  if (!view.value.known) return '—';
  return view.value.character.present
    ? t('settings.cleanup.characterCount', { nick: view.value.character.nick ?? '' })
    : t('settings.cleanup.characterMissing');
});

const cards = computed<ResetCard[]>(() => [
  {
    scope: 'inventory',
    icon: 'i-lucide-backpack',
    title: t('settings.cleanup.inventoryTitle'),
    text: t('settings.cleanup.inventoryText'),
    count: count('settings.cleanup.inventoryCount', { records: view.value.records, copies: view.value.copies }),
    action: t('settings.cleanup.clearInventory'),
    disabled: !view.value.known || view.value.records === 0,
  },
  {
    scope: 'manualStats',
    icon: 'i-lucide-sliders-horizontal',
    title: t('settings.cleanup.manualStatsTitle'),
    text: t('settings.cleanup.manualStatsText'),
    count: count('settings.cleanup.manualStatsCount', { records: view.value.manualStats }),
    action: t('settings.cleanup.clearManualStats'),
    disabled: !view.value.known || view.value.manualStats === 0,
  },
  {
    scope: 'character',
    icon: 'i-lucide-user-round',
    title: t('settings.cleanup.characterTitle'),
    text: t('settings.cleanup.characterText'),
    count: characterLabel.value,
    action: t('settings.cleanup.clearCharacter'),
    disabled: !view.value.known || !view.value.character.present,
  },
  {
    scope: 'journal',
    icon: 'i-lucide-history',
    title: t('settings.cleanup.journalTitle'),
    text: t('settings.cleanup.journalText'),
    count: count('settings.cleanup.journalCount', { events: view.value.journal }),
    action: t('settings.cleanup.clearJournal'),
    disabled: !view.value.known || view.value.journal === 0,
  },
  {
    scope: 'all',
    icon: 'i-lucide-rotate-ccw',
    title: t('settings.cleanup.allTitle'),
    text: t('settings.cleanup.allText'),
    count: count('settings.cleanup.allCount', { records: view.value.records, events: view.value.journal }),
    action: t('settings.cleanup.resetAll'),
    disabled: !view.value.known || (!view.value.character.present && view.value.journal === 0),
    danger: true,
  },
]);

const target = ref<CleanupScope | null>(null);
const confirmOpen = computed({
  get: () => target.value !== null,
  set: (value: boolean) => {
    if (!value) target.value = null;
  },
});

const confirmation = computed<Confirmation>(() => {
  const known = view.value;
  switch (target.value) {
    case 'inventory':
      return {
        label: t('settings.cleanup.clearInventory'),
        description: t('settings.cleanup.confirmInventory', { records: known.records, copies: known.copies }),
      };
    case 'manualStats':
      return {
        label: t('settings.cleanup.clearManualStats'),
        description: t('settings.cleanup.confirmManualStats', { records: known.manualStats }),
      };
    case 'character':
      return {
        label: t('settings.cleanup.clearCharacter'),
        description: t('settings.cleanup.confirmCharacter', {
          nick: known.character.nick ?? '',
          records: known.records,
        }),
      };
    case 'journal':
      return {
        label: t('settings.cleanup.clearJournal'),
        description: t('settings.cleanup.confirmJournal', { events: known.journal }),
      };
    case 'all': {
      const word = t('settings.cleanup.requireWord');
      return {
        label: t('settings.cleanup.resetAll'),
        description: t('settings.cleanup.confirmAll', { word }),
        requireText: word,
      };
    }
    default:
      return { label: '', description: '' };
  }
});

async function run(): Promise<void> {
  const scope = target.value;
  if (!scope) return;

  const result = await write('/api/v1/admin/cleanup', {
    method: 'POST',
    body: { scope, dryRun: false },
  });
  if (!result) return;

  target.value = null;
  await refreshNuxtData('event-log');
  if (scope === 'character' || scope === 'all') {
    // The wizard must fetch a fresh state, not the cached one from before the reset.
    clearNuxtData('setup-state');
    await navigateTo('/setup');
    return;
  }
  await refreshCounts();
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">
        {{ t('settings.cleanup.intro') }}
      </p>
      <div v-if="!view.known" class="flex items-center gap-2">
        <span class="text-[11.5px] text-[var(--sz-text-dim)]">{{ t('settings.cleanup.countsUnavailable') }}</span>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('settings.cleanup.countsRetry')"
          :loading="countsStatus === 'pending'"
          @click="refreshCounts()"
        />
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <ProfilePane
        v-for="card in cards"
        :key="card.scope"
        :title="card.title"
        dense
        :class="card.danger ? 'border-[var(--sz-danger)] md:col-span-2' : undefined"
      >
        <div class="flex items-start gap-2">
          <UIcon :name="card.icon" class="mt-0.5 size-4 shrink-0 text-[var(--sz-text-muted)]" aria-hidden="true" />
          <div class="min-w-0">
            <p class="text-[12.5px] leading-relaxed text-[var(--sz-text-muted)]">{{ card.text }}</p>
            <p class="mt-2 text-[12.5px] tabular-nums">{{ card.count }}</p>
          </div>
        </div>
        <div class="mt-3">
          <UButton
            color="error"
            :variant="card.danger ? 'solid' : 'soft'"
            size="sm"
            :label="card.action"
            :disabled="card.disabled"
            @click="target = card.scope"
          />
        </div>
      </ProfilePane>
    </div>

    <p class="text-[11.5px] text-[var(--sz-text-dim)]">
      {{ t('settings.cleanup.exportHint') }}
      <NuxtLink to="/api/v1/admin/export" external class="text-[var(--sz-accent)]">
        {{ t('settings.cleanup.exportLink') }}
      </NuxtLink>
      {{ t('settings.cleanup.journalHint') }}
    </p>

    <ConfirmActionModal
      v-model:open="confirmOpen"
      :title="t('settings.cleanup.confirmTitle')"
      :description="confirmation.description"
      :confirm-label="confirmation.label"
      :loading="writeBusy"
      :require-text="confirmation.requireText"
      @confirm="run"
    />
  </div>
</template>
