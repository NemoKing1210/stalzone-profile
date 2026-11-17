<script setup lang="ts">
import { InventoryScreen, containersKind } from '~/features/inventory';
</script>

<template>
  <InventoryScreen :kind="containersKind" />
</template>
