<script setup lang="ts">
import type { ArtifactPayload } from '~/composables/useDossier';

useHead({ title: 'Артефакты — STALZONE Dossier' });

const { payload } = useDossier();
const filters = useFilters('artifacts', { q: '', type: 'all', sort: 'name' });
const selected = ref<ArtifactPayload | null>(null);
const modalOpen = computed({
  get: () => selected.value !== null,
  set: (value: boolean) => {
    if (!value) selected.value = null;
  },
});

const artifacts = computed(() => payload.value?.artifacts ?? []);

const typeItems = computed(() => {
  const types = [...new Set(artifacts.value.map((artifact) => artifact.type).filter(Boolean))] as string[];
  types.sort((a, b) => a.localeCompare(b, 'ru'));
  return [{ label: 'Все типы', value: 'all' }, ...types.map((type) => ({ label: type, value: type }))];
});

const sortItems = [
  { label: 'По названию', value: 'name' },
  { label: 'По уровню (сначала выше)', value: 'lvl-desc' },
  { label: 'По уровню (сначала ниже)', value: 'lvl-asc' },
  { label: 'По рангу', value: 'rank' },
];

const filtered = computed(() => {
  const query = filters.q.trim().toLowerCase();
  const list = artifacts.value.filter((artifact) => {
    if (filters.type !== 'all' && artifact.type !== filters.type) return false;
    if (!query) return true;
    return [artifact.name, artifact.type, artifact.effects]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
  return [...list].sort((a, b) => {
    if (filters.sort === 'lvl-desc') return (b.lvl ?? 0) - (a.lvl ?? 0);
    if (filters.sort === 'lvl-asc') return (a.lvl ?? 0) - (b.lvl ?? 0);
    if (filters.sort === 'rank') return String(a.rank ?? '').localeCompare(String(b.rank ?? ''));
    return a.name.localeCompare(b.name, 'ru');
  });
});

const details = computed(() => payload.value?.details ?? {});
const selectedCard = computed(() =>
  selected.value ? findDetailsCard(details.value, 'art', selected.value.name) : null,
);
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Артефакты</h1>
        <p class="text-sm text-muted">{{ filtered.length }} из {{ artifacts.length }} · эффекты и уровень заточки</p>
      </div>
      <FreshnessBadge
        :data-updated="payload?.freshness.dataUpdated"
        :prices-age-min="payload?.freshness.pricesAgeMin"
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UInput v-model="filters.q" icon="i-lucide-search" placeholder="Поиск: название, тип, эффект" class="w-full sm:w-72" />
      <USelect v-model="filters.type" :items="typeItems" class="w-52" aria-label="Тип артефакта" />
      <USelect v-model="filters.sort" :items="sortItems" class="w-64" aria-label="Сортировка" />
      <UButton
        v-if="filters.q || filters.type !== 'all'"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        label="Сбросить"
        @click="
          () => {
            filters.q = '';
            filters.type = 'all';
          }
        "
      />
    </div>

    <div v-if="filtered.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <button
        v-for="artifact in filtered"
        :key="`${artifact.name}-${artifact.lvl}`"
        type="button"
        class="w-full text-left"
        @click="selected = artifact"
      >
        <UCard class="h-full transition hover:border-primary/40">
          <div class="flex items-start gap-3">
            <img
              v-if="artifact.icon"
              :src="artifact.icon"
              :alt="artifact.name"
              class="size-12 rounded-md bg-elevated object-contain p-1"
              loading="lazy"
            >
            <div v-else class="flex size-12 items-center justify-center rounded-md bg-elevated">
              <UIcon name="i-lucide-gem" class="size-6 text-muted" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ artifact.name }}</p>
              <p class="text-xs text-muted">{{ artifact.type ?? 'тип не указан' }}</p>
              <div class="mt-1 flex flex-wrap gap-1">
                <RankBadge :rank="artifact.rank" />
                <UBadge v-if="artifact.q" color="neutral" variant="subtle">{{ artifact.q }}</UBadge>
                <UBadge color="neutral" variant="subtle">+{{ artifact.lvl }}</UBadge>
              </div>
            </div>
          </div>
          <p v-if="artifact.effects" class="mt-3 line-clamp-3 text-sm text-muted">{{ artifact.effects }}</p>
          <p v-else class="mt-3 text-sm text-muted">нет данных об эффектах</p>
        </UCard>
      </button>
    </div>
    <UEmpty
      v-else
      icon="i-lucide-gem"
      title="Пусто"
      :description="
        artifacts.length
          ? 'Под фильтры ничего не подошло.'
          : 'В досье пока нет артефактов. Добавьте их через API или MCP.'
      "
    />

    <p class="text-xs text-muted">Клик по карточке открывает исходную карточку артефакта с диапазонами значений.</p>

    <UModal v-model:open="modalOpen" title="Карточка артефакта" :description="selected?.name" scrollable>
      <template #body>
        <ItemCard
          v-if="selected"
          :name="selected.name"
          kind="artifact"
          :data="selected"
          :card="selectedCard"
          :level="selected.lvl"
        />
      </template>
    </UModal>
  </section>
</template>
