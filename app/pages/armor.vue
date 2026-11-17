<script setup lang="ts">
import { InventoryScreen, armorKind } from '~/features/inventory';
</script>

<template>
  <InventoryScreen :kind="armorKind" />
</template>
