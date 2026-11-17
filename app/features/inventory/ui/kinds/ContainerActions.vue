<script setup lang="ts">
import type { FillTarget, OwnedKind } from '~/shared/types/profile';

import AddOwnedModal from '../AddOwnedModal.vue';
import ContainerFillEditor from '../ContainerFillEditor.vue';

const open = defineModel<boolean>('addOpen', { default: false });
defineProps<{ kind: OwnedKind }>();

const fillTarget = ref<FillTarget | null>(null);
const fillOpen = computed({
  get: () => fillTarget.value !== null,
  set: (value: boolean) => {
    if (!value) fillTarget.value = null;
  },
});

/** A container just added to the profile opens straight into the fill editor. */
function onCreated(created: { ownedId: number; name: string }): void {
  fillTarget.value = { ownedId: created.ownedId, name: created.name, artifacts: [], artifactsAsOf: null };
}
</script>

<template>
  <div>
    <AddOwnedModal v-model:open="open" :kind="kind" @created="onCreated" />
    <ContainerFillEditor v-model:open="fillOpen" :container="fillTarget" />
  </div>
</template>
