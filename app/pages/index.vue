<script setup lang="ts">
useHead({ title: 'Обзор — STALZONE Dossier' });

const { payload } = useDossier();
const { fmtMoney, num, formatDate } = useFormat();

const character = computed(() => payload.value?.character ?? {});
const hasCharacter = computed(() => Object.keys(character.value).length > 0);
const metaInfo = computed(() => payload.value?.meta ?? {});
const editOpen = ref(false);

const counts = computed(() => [
  { label: 'Оружие', value: payload.value?.weapons.length ?? 0, icon: 'i-lucide-crosshair', to: '/weapons' },
  { label: 'Броня', value: payload.value?.armor.length ?? 0, icon: 'i-lucide-shield', to: '/armor' },
  { label: 'Контейнеры', value: payload.value?.containers.length ?? 0, icon: 'i-lucide-backpack', to: '/containers' },
  { label: 'Артефакты', value: payload.value?.artifacts.length ?? 0, icon: 'i-lucide-gem', to: '/artifacts' },
  { label: 'Сборки', value: payload.value?.builds.items.length ?? 0, icon: 'i-lucide-layers', to: '/builds' },
]);

const stats = computed(() => [
  { label: 'Часов в игре', value: character.value.hours == null ? '—' : num(character.value.hours) },
  { label: 'K/D', value: character.value.kd == null ? '—' : String(character.value.kd).replace('.', ',') },
  {
    label: 'Точность',
    value: character.value.accuracy == null ? '—' : `${character.value.accuracy}%`,
  },
  {
    label: 'В голову',
    value: character.value.headshot == null ? '—' : `${character.value.headshot}%`,
  },
  {
    label: 'Достижения',
    value:
      character.value.achievements == null
        ? '—'
        : `${num(character.value.achievements)} · ${num(character.value.achievementPoints ?? 0)} очков`,
  },
  { label: 'Деньги', value: character.value.money == null ? '—' : fmtMoney(character.value.money) },
  {
    label: 'Максимум денег',
    value: character.value.maxMoney == null ? '—' : fmtMoney(character.value.maxMoney),
  },
  { label: 'В Зоне с', value: formatDate(character.value.arrived) },
]);

const career = computed(() => {
  const list = payload.value?.career ?? [];
  return list
    .filter((entry): entry is [string, number] => Array.isArray(entry) && entry.length >= 2)
    .map(([label, value]) => ({ label, value }));
});
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
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-if="hasCharacter"
          icon="i-lucide-pencil"
          color="neutral"
          variant="outline"
          label="Изменить профиль"
          @click="editOpen = true"
        />
        <UBadge color="neutral" variant="subtle" icon="i-lucide-shield-check">Доступ только для владельца</UBadge>
      </div>
    </div>

    <template v-if="hasCharacter">
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

      <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-user-round" class="size-5 text-primary" />
              <h2 class="font-medium">Персонаж</h2>
            </div>
          </template>
          <dl class="grid gap-3 sm:grid-cols-2">
            <div v-for="stat in stats" :key="stat.label" class="rounded-md bg-elevated/60 p-3">
              <dt class="text-xs text-muted">{{ stat.label }}</dt>
              <dd class="font-medium tabular-nums">{{ stat.value }}</dd>
            </div>
          </dl>
          <p v-if="character.stash || character.playstyle" class="mt-3 text-sm text-muted">
            <span v-if="character.stash">Тайник: {{ character.stash }}.</span>
            <span v-if="character.playstyle"> Стиль: {{ character.playstyle }}.</span>
          </p>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-chart-no-axes-column" class="size-5 text-primary" />
              <h2 class="font-medium">Карьера</h2>
            </div>
          </template>
          <dl v-if="career.length" class="grid grid-cols-1 gap-x-4 gap-y-1 text-sm">
            <div v-for="entry in career" :key="entry.label" class="flex justify-between gap-3 border-b border-default py-1">
              <dt class="text-muted">{{ entry.label }}</dt>
              <dd class="tabular-nums">{{ num(entry.value) }}</dd>
            </div>
          </dl>
          <p v-else class="text-sm text-muted">нет данных о карьере</p>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-info" class="size-5 text-primary" />
            <h2 class="font-medium">О данных</h2>
          </div>
        </template>
        <p class="text-sm text-muted">
          Снимок досье: {{ formatDate(payload?.freshness.dataUpdated) }}.
          <span v-if="metaInfo.source"> Источники: {{ metaInfo.source }}.</span>
          Цены обновляются отдельно; отсутствующий лот показывается как «нет лота», отсутствующая характеристика — «нет
          данных». Все числа пересчитаны по единой формуле из базы.
        </p>
      </UCard>
    </template>

    <UEmpty
      v-else
      icon="i-lucide-folder-open"
      title="Досье пусто"
      description="Импортируйте исходные данные командой npm run import:legacy или добавьте снаряжение через API или MCP."
    />

    <EditCharacterModal v-model:open="editOpen" :character="character" />
  </section>
</template>
