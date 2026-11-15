<script setup lang="ts">
useHead({ title: 'Обзор — STALZONE Dossier' });

const { payload } = useDossier();
const character = computed(() => payload.value?.character ?? {});
const counts = computed(() => [
  { label: 'Оружие', value: payload.value?.weapons.length ?? 0, icon: 'i-lucide-crosshair', to: '/weapons' },
  { label: 'Броня', value: payload.value?.armor.length ?? 0, icon: 'i-lucide-shield', to: '/armor' },
  { label: 'Контейнеры', value: payload.value?.containers.length ?? 0, icon: 'i-lucide-backpack', to: '/containers' },
  { label: 'Артефакты', value: payload.value?.artifacts.length ?? 0, icon: 'i-lucide-gem', to: '/artifacts' },
  { label: 'Сборки', value: payload.value?.builds.items.length ?? 0, icon: 'i-lucide-layers', to: '/builds' },
]);
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm text-muted">Личное досье</p>
        <h1 class="text-3xl font-semibold">{{ character.nick ?? 'STALZONE' }}</h1>
        <p class="text-sm text-muted">
          {{ character.faction ?? 'фракция не указана' }}
          <span v-if="character.clan"> · {{ character.clan }}</span>
          <span v-if="character.realm"> · {{ character.realm }}</span>
        </p>
      </div>
      <UBadge color="neutral" variant="subtle" icon="i-lucide-shield-check">Доступ только для владельца</UBadge>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <NuxtLink v-for="card in counts" :key="card.to" :to="card.to" class="block">
        <UCard class="h-full transition hover:border-primary/40">
          <div class="flex items-center justify-between">
            <UIcon :name="card.icon" class="size-5 text-primary" />
            <span class="text-2xl font-semibold tabular-nums">{{ card.value }}</span>
          </div>
          <p class="mt-2 text-sm text-muted">{{ card.label }}</p>
        </UCard>
      </NuxtLink>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-info" class="size-5 text-primary" />
          <h2 class="font-medium">Что дальше</h2>
        </div>
      </template>
      <p class="text-muted">
        Разделы досье открываются из верхнего меню. Данные читаются из SQLite, правки сохраняются через API и
        записываются в журнал. Числа показываются по единой формуле, отсутствующие значения — «нет данных».
      </p>
    </UCard>
  </section>
</template>
