<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center gap-0.5 border border-dashed border-[var(--sz-border-strong)] px-1 text-[9px] uppercase leading-tight tracking-[0.08em] text-[var(--sz-text-muted)]"
    :title="t('items.virtualHint')"
    :aria-label="t('items.virtualHint')"
  >
    <UIcon name="i-lucide-flask-conical" class="size-3" aria-hidden="true" />
    <span aria-hidden="true">{{ t('items.virtualShort') }}</span>
  </span>
</template>
