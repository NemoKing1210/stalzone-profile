<script setup lang="ts">
useHead({ title: 'Заметки — STALZONE Dossier' });

interface Note {
  title?: string;
  text?: string;
}

const { payload } = useDossier();
const filters = useFilters('notes', { q: '' });
const notes = computed(() => (payload.value?.notes ?? []) as unknown as Note[]);

const filtered = computed(() => {
  const query = filters.q.trim().toLowerCase();
  if (!query) return notes.value;
  return notes.value.filter((note) =>
    [note.title, note.text]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
});
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Заметки</h1>
        <p class="text-sm text-muted">{{ filtered.length }} из {{ notes.length }} · правила игры и расчётов</p>
      </div>
      <FreshnessBadge
        :data-updated="payload?.freshness.dataUpdated"
        :prices-age-min="payload?.freshness.pricesAgeMin"
      />
    </div>

    <UInput v-model="filters.q" icon="i-lucide-search" placeholder="Поиск по заметкам" class="w-full sm:w-80" />

    <div v-if="filtered.length" class="grid gap-4 lg:grid-cols-2">
      <UCard v-for="note in filtered" :key="note.title">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-notebook-pen" class="size-5 text-primary" />
            <h2 class="font-medium">{{ note.title }}</h2>
          </div>
        </template>
        <p class="whitespace-pre-line text-sm text-muted">{{ note.text }}</p>
      </UCard>
    </div>
    <UEmpty
      v-else
      icon="i-lucide-notebook-pen"
      title="Пусто"
      :description="
        notes.length ? 'Под фильтры ничего не подошло.' : 'В досье пока нет заметок. Добавьте их через API или MCP.'
      "
    />
  </section>
</template>
