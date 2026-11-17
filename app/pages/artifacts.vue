<script setup lang="ts">
import { InventoryScreen, artifactsKind } from '~/features/inventory';
</script>

<template>
  <InventoryScreen :kind="artifactsKind" />
</template>
