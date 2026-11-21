<script setup lang="ts">
import { InventoryScreen, modificationsKind } from '~/features/inventory';
</script>

<template>
  <InventoryScreen :kind="modificationsKind" />
</template>
