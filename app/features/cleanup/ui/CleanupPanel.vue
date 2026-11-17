<script setup lang="ts">
import { ConfirmActionModal, ProfilePane } from '~/shared/ui';

import type { CleanupCounts } from '@profile/shared/contracts';
import { cleanupCountsView } from '../model/cleanupCounts';

const { t } = useI18n();
const { write, busy: writeBusy } = useWrite();

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

const confirmOpen = ref(false);

const confirmation = computed(() => ({
  label: t('settings.cleanup.clearInventory'),
  description: t('settings.cleanup.confirmInventory', {
    records: view.value.records,
    copies: view.value.copies,
  }),
}));

async function clear(): Promise<void> {
  const result = await write('/api/v1/admin/cleanup', {
    method: 'POST',
    body: { dryRun: false },
  });
  if (!result) return;

  confirmOpen.value = false;
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

    <ProfilePane :title="t('settings.cleanup.inventoryTitle')" dense class="border-[var(--sz-danger)]">
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
          size="sm"
          :label="t('settings.cleanup.clearInventory')"
          :disabled="!view.known || view.records === 0"
          @click="confirmOpen = true"
        />
      </div>
    </ProfilePane>

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
