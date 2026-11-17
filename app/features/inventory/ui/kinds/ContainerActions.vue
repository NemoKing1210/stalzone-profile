<script setup lang="ts">
import type { OwnedKind } from '~/shared/types/profile';

import AddOwnedModal from '../AddOwnedModal.vue';

/**
 * Adding a container no longer opens the fill editor: the fill is positional and needs
 * the created instance read (its slot count arrives with the refreshed payload). The
 * row action `containers.fill` opens it from the table instead.
 */
const open = defineModel<boolean>('addOpen', { default: false });
defineProps<{ kind: OwnedKind }>();
</script>

<template>
  <AddOwnedModal v-model:open="open" :kind="kind" />
</template>
