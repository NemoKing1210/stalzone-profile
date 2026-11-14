<script setup lang="ts">
useHead({ title: 'STALZONE Dossier' });
</script>

<template>
  <div class="mx-auto max-w-3xl p-6 sm:p-10">
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-folder-search" class="size-6 text-primary" />
          <h1 class="text-xl font-semibold">STALZONE Dossier</h1>
        </div>
      </template>
      <p class="text-muted">
        Каркас Nuxt UI готов. Разделы досье появятся на следующих шагах.
      </p>
    </UCard>
  </div>
</template>
