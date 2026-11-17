<script setup lang="ts">
import type { OwnedKind } from '~/shared/types/dossier';

import AddOwnedModal from '../AddOwnedModal.vue';

const open = defineModel<boolean>('addOpen', { default: false });
defineProps<{ kind: OwnedKind }>();
</script>

<template>
  <AddOwnedModal v-model:open="open" :kind="kind" />
</template>
