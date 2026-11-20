<script setup lang="ts">
import { InventoryScreen, devicesKind } from '~/features/inventory';
</script>

<template>
  <InventoryScreen :kind="devicesKind" />
</template>
