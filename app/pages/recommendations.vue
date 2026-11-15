<script setup lang="ts">
useHead({ title: 'Рекомендации — STALZONE Dossier' });

interface RecommendationRow {
  k: string;
  v: string;
  d: string;
}

interface Recommendation {
  id?: string;
  title?: string;
  lead?: string;
  rows?: RecommendationRow[];
}

const { payload } = useDossier();
const recommendations = computed(
  () => (payload.value?.recommendations ?? []) as unknown as Recommendation[],
);
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Рекомендации</h1>
        <p class="text-sm text-muted">{{ recommendations.length }} сценария · готовые наборы из досье</p>
      </div>
      <FreshnessBadge
        :data-updated="payload?.freshness.dataUpdated"
        :prices-age-min="payload?.freshness.pricesAgeMin"
      />
    </div>

    <div v-if="recommendations.length" class="grid gap-4 lg:grid-cols-2">
      <UCard v-for="recommendation in recommendations" :key="recommendation.id ?? recommendation.title">
        <template #header>
          <div>
            <h2 class="text-lg font-semibold">{{ recommendation.title }}</h2>
            <p v-if="recommendation.lead" class="mt-1 text-sm text-muted">{{ recommendation.lead }}</p>
          </div>
        </template>
        <dl v-if="recommendation.rows?.length" class="divide-y divide-default text-sm">
          <div
            v-for="row in recommendation.rows"
            :key="row.k"
            class="grid gap-1 py-2 sm:grid-cols-[9rem_1fr] sm:gap-3"
          >
            <dt class="text-muted">{{ row.k }}</dt>
            <dd>
              <p class="font-medium">{{ row.v }}</p>
              <p class="text-muted">{{ row.d }}</p>
            </dd>
          </div>
        </dl>
        <p v-else class="text-sm text-muted">нет данных о составе</p>
      </UCard>
    </div>
    <UEmpty
      v-else
      icon="i-lucide-lightbulb"
      title="Пусто"
      description="В досье пока нет рекомендаций. Добавьте их через API или MCP."
    />
  </section>
</template>
