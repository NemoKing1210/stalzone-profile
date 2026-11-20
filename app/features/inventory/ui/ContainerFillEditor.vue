<script setup lang="ts">
import type { InventoryItemRead, WriteResult } from '@profile/shared/contracts';
import type { ContainerFillTarget } from '~/shared/types/profile';
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';

import ContainerPanel from './grid/ContainerPanel.vue';

const open = defineModel<boolean>('open', { default: false });
const props = withDefaults(
  defineProps<{
    target: ContainerFillTarget | null;
    /** Owned artifacts anywhere in the inventory; the panel filters the installed ones. */
    candidates?: InventoryItemRead[];
  }>(),
  { candidates: () => [] },
);
const emit = defineEmits<{ saved: [] }>();

const { write, busy } = useWrite();
const { t } = useI18n();

async function submit(slots: (number | null)[]): Promise<void> {
  const container = props.target?.container;
  if (!container) return;
  const result = await write<WriteResult>(`/api/v1/inventory/containers/${container.id}/fill`, {
    method: 'PUT',
    body: { slots },
  });
  if (!result) return;
  open.value = false;
  emit('saved');
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('forms.fillTitle')"
    :description="props.target?.container.name"
    :ui="{ content: MODAL_WIDTH.form }"
    scrollable
  >
    <template #body>
      <ContainerPanel
        v-if="props.target"
        :container="props.target.container"
        :candidates="props.candidates"
        :busy="busy"
        @fill="submit"
      />
    </template>
  </UModal>
</template>
