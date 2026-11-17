<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    confirmLabel?: string;
    loading?: boolean;
    /** When set, the confirm button stays disabled until the user types this exact text. */
    requireText?: string;
    requireHint?: string;
  }>(),
  { confirmLabel: undefined, description: '', requireText: undefined, requireHint: undefined },
);

const emit = defineEmits<{ confirm: [] }>();

const typed = ref('');
const blocked = computed(() => Boolean(props.requireText) && typed.value.trim() !== props.requireText);

watch(open, (value) => {
  if (value) typed.value = '';
});
</script>

<template>
  <UModal v-model:open="open" :title="props.title" :description="props.description">
    <template v-if="props.requireText" #body>
      <div class="space-y-2">
        <p v-if="props.requireHint" class="text-[12.5px] text-[var(--sz-text-muted)]">{{ props.requireHint }}</p>
        <UInput
          v-model="typed"
          class="w-full font-mono"
          :placeholder="props.requireText"
          autocomplete="off"
          :aria-label="props.requireHint ?? props.requireText"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="open = false" />
        <UButton
          color="error"
          :loading="props.loading"
          :disabled="blocked"
          :label="props.confirmLabel ?? t('common.delete')"
          @click="emit('confirm')"
        />
      </div>
    </template>
  </UModal>
</template>

<style>
/* The confirm dialog's buttons are themed UButtons; the theme owns their disabled look. */
/* Hallmark · waive 26b · UButton renders disabled while loading and the Nuxt UI theme paints that state · the confirm dialog's delete and cancel buttons are themed UButtons, so no disabled state is authored here */
</style>
