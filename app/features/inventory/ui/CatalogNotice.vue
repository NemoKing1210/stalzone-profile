<script setup lang="ts">
const { t } = useI18n();
const { payload } = useProfile();

/** The catalog is empty until the first sync, so gear cannot be added yet. */
const empty = computed(() => {
  const meta = payload.value?.catalog?.meta as { items?: number } | undefined;
  return Number(meta?.items ?? 0) === 0;
});
</script>

<template>
  <div
    v-if="empty"
    class="mb-3 flex flex-wrap items-center justify-between gap-2 border border-[var(--sz-border)] bg-[var(--sz-surface)] px-3 py-2"
  >
    <div class="min-w-0">
      <p class="text-[13px] text-[var(--sz-text)]">{{ t('catalogNotice.title') }}</p>
      <p class="text-[11.5px] text-[var(--sz-text-muted)]">{{ t('catalogNotice.text') }}</p>
    </div>
    <UButton size="xs" to="/settings" :label="t('catalogNotice.action')" />
  </div>
</template>
