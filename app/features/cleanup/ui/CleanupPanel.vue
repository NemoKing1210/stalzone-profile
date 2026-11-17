<script setup lang="ts">
import { ConfirmActionModal, DossierPane } from '~/shared/ui';

import type { CleanupCounts, CleanupScope } from '@dossier/shared/contracts';
import { cleanupCountsView } from '../model/cleanupCounts';

const { t } = useI18n();
const { write, busy: writeBusy } = useWrite();

type Scope = CleanupScope;

const {
  data: counts,
  status: countsStatus,
  refresh: refreshCounts,
} = useAsyncData<CleanupCounts | null>('cleanup-counts', () => $fetch<CleanupCounts>('/api/v1/admin/cleanup'), {
  default: () => null,
  immediate: false,
});
onMounted(() => refreshCounts());

const view = computed(() => cleanupCountsView(countsStatus.value, counts.value));

const scope = ref<Scope | null>(null);
const confirmOpen = computed({
  get: () => scope.value !== null,
  set: (value: boolean) => {
    if (!value) scope.value = null;
  },
});

const confirmation = computed(() => {
  switch (scope.value) {
    case 'owned':
      return {
        label: t('settings.cleanup.clearInventory'),
        description: t('settings.cleanup.confirmInventory', {
          records: view.value.records,
          copies: view.value.copies,
        }),
      };
    case 'builds':
      return {
        label: t('settings.cleanup.clearBuilds'),
        description: t('settings.cleanup.confirmBuilds', { count: view.value.builds }),
      };
    default:
      return {
        label: t('settings.cleanup.clearAll'),
        description: t('settings.cleanup.confirmAll', {
          records: view.value.records,
          copies: view.value.copies,
          count: view.value.builds,
        }),
      };
  }
});

async function clear(): Promise<void> {
  const current = scope.value;
  if (!current) return;

  const result = await write('/api/v1/admin/cleanup', {
    method: 'POST',
    body: { scope: current, dryRun: false },
  });
  if (!result) return;

  scope.value = null;
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

    <DossierPane :title="t('settings.cleanup.inventoryTitle')" dense>
      <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('settings.cleanup.inventoryText') }}</p>
      <p class="mt-2 text-[12.5px] tabular-nums">
        {{
          view.known
            ? t('settings.cleanup.inventoryCount', { records: view.records, copies: view.copies })
            : '—'
        }}
      </p>
      <div class="mt-3">
        <UButton
          color="error"
          variant="outline"
          size="sm"
          :label="t('settings.cleanup.clearInventory')"
          :disabled="!view.known || view.records === 0"
          @click="scope = 'owned'"
        />
      </div>
    </DossierPane>

    <DossierPane :title="t('settings.cleanup.buildsTitle')" dense>
      <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('settings.cleanup.buildsText') }}</p>
      <p class="mt-2 text-[12.5px] tabular-nums">
        {{ view.known ? t('settings.cleanup.buildsCount', { count: view.builds }) : '—' }}
      </p>
      <div class="mt-3">
        <UButton
          color="error"
          variant="outline"
          size="sm"
          :label="t('settings.cleanup.clearBuilds')"
          :disabled="!view.known || view.builds === 0"
          @click="scope = 'builds'"
        />
      </div>
    </DossierPane>

    <DossierPane :title="t('settings.cleanup.allTitle')" dense class="border-[var(--sz-danger)]">
      <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('settings.cleanup.allText') }}</p>
      <p class="mt-2 text-[12.5px] tabular-nums">
        {{
          view.known
            ? t('settings.cleanup.allCount', { records: view.records, copies: view.copies, count: view.builds })
            : '—'
        }}
      </p>
      <div class="mt-3">
        <UButton
          color="error"
          size="sm"
          :label="t('settings.cleanup.clearAll')"
          :disabled="!view.known || (view.records === 0 && view.builds === 0)"
          @click="scope = 'all'"
        />
      </div>
    </DossierPane>

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
      @confirm="clear"
    />
  </div>
</template>
