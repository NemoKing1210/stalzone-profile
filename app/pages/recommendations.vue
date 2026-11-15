<script setup lang="ts">
import type { ContentEditTarget } from '~/types/dossier';

const { t } = useI18n();
useHead(() => ({ title: `${t('recommendations.pageTitle')} — ${t('common.appName')}` }));

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
  slug?: string | null;
  position?: number;
  [key: string]: unknown;
}

const { payload } = useDossier();
const recommendations = computed(
  () => (payload.value?.recommendations ?? []) as unknown as Recommendation[],
);
const editTarget = ref<ContentEditTarget | null>(null);
const editOpen = computed({
  get: () => editTarget.value !== null,
  set: (value: boolean) => {
    if (!value) editTarget.value = null;
  },
});

function startEdit(recommendation: Recommendation): void {
  editTarget.value = {
    kind: 'recs',
    slug: recommendation.slug ?? null,
    title: recommendation.title ?? null,
    lead: recommendation.lead ?? null,
    payload: recommendation,
    position: recommendation.position ?? 0,
  };
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">{{ t('recommendations.title') }}</h1>
        <p class="text-sm text-muted">
          {{ t('recommendations.summary', { count: recommendations.length }) }}
        </p>
      </div>
      <FreshnessBadge
        :data-updated="payload?.freshness.dataUpdated"
        :prices-age-min="payload?.freshness.pricesAgeMin"
      />
    </div>

    <div v-if="recommendations.length" class="grid gap-4 lg:grid-cols-2">
      <UCard v-for="recommendation in recommendations" :key="recommendation.id ?? recommendation.title">
        <template #header>
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <h2 class="text-lg font-semibold">{{ recommendation.title }}</h2>
              <p v-if="recommendation.lead" class="mt-1 text-sm text-muted">{{ recommendation.lead }}</p>
            </div>
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('recommendations.editAria', { title: recommendation.title ?? '' })"
              @click="startEdit(recommendation)"
            />
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
        <p v-else class="text-sm text-muted">{{ t('recommendations.emptyRows') }}</p>
      </UCard>
    </div>
    <UEmpty
      v-else
      icon="i-lucide-lightbulb"
      :title="t('common.empty')"
      :description="t('recommendations.emptyDescription')"
    />

    <EditContentBlock v-model:open="editOpen" :target="editTarget" />
  </section>
</template>
