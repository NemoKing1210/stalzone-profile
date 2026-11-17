<script setup lang="ts">
import { InventoryScreen, weaponsKind } from '~/features/inventory';
</script>

<template>
  <InventoryScreen :kind="weaponsKind" />
</template>
