<script setup lang="ts">
defineProps<{ title: string; icon?: string; text?: string }>();
const { t } = useI18n();
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center gap-3">
      <UIcon v-if="icon" :name="icon" class="size-6 text-primary" />
      <h1 class="text-2xl font-semibold">{{ title }}</h1>
    </div>
    <UCard>
      <p class="text-muted">{{ text ?? t('common.sectionStub') }}</p>
    </UCard>
  </section>
</template>
