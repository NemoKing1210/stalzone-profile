<script setup lang="ts">
import type { ContainerPayload } from '~/shared/types/profile';

import type { ContainerRow } from '../../model/kinds/containers';
import ContainerDetail from '../ContainerDetail.vue';

const props = defineProps<{ row: ContainerRow }>();
const emit = defineEmits<{ edit: []; fill: []; close: []; artifact: [name: string, level: number] }>();

const { t } = useI18n();

/** ContainerDetail reads the legacy container shape; the instance row carries the same fields. */
const container = computed(() => props.row as unknown as ContainerPayload);

/** The artifact card is a screen-level sibling: the container modal unmounts on close. */
function openArtifact(name: string, level: number): void {
  emit('artifact', name, level);
}
</script>

<template>
  <div>
    <ContainerDetail :container="container" @artifact="openArtifact" />

    <div v-if="row.instanceId != null" class="mt-3 flex flex-wrap gap-2 border-t border-[var(--sz-border)] pt-3">
      <UButton
        icon="i-lucide-pencil"
        color="neutral"
        variant="outline"
        size="xs"
        :label="t('common.edit')"
        @click="$emit('edit')"
      />
      <UButton
        icon="i-lucide-gem"
        color="neutral"
        variant="outline"
        size="xs"
        :label="t('containers.fill')"
        @click="$emit('fill')"
      />
    </div>
  </div>
</template>
