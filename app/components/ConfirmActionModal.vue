<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false });

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    confirmLabel?: string;
    loading?: boolean;
  }>(),
  { confirmLabel: 'Удалить', description: '' },
);

const emit = defineEmits<{ confirm: [] }>();
</script>

<template>
  <UModal v-model:open="open" :title="props.title" :description="props.description">
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" label="Отмена" @click="open = false" />
        <UButton color="error" :loading="props.loading" :label="props.confirmLabel" @click="emit('confirm')" />
      </div>
    </template>
  </UModal>
</template>
