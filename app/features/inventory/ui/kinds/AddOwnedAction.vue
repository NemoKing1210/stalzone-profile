<script setup lang="ts">
import type { InventoryKind } from '@profile/shared/contracts';

import AddOwnedModal from '../AddOwnedModal.vue';

const open = defineModel<boolean>('addOpen', { default: false });
defineProps<{ kind: InventoryKind }>();
</script>

<template>
  <AddOwnedModal v-model:open="open" :kind="kind" />
</template>
