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
        <h1 class="min-w-0 break-words">{{ t('recommendations.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ t('recommendations.summary', { count: recommendations.length }) }}
        </p>
      </div>
    </div>

    <div v-if="recommendations.length" class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <DossierPane
        v-for="recommendation in recommendations"
        :key="recommendation.id ?? recommendation.title"
        :label="recommendation.title ?? ''"
        dense
      >
        <template #header>
          <div class="flex min-w-0 flex-1 items-baseline gap-2">
            <h2 class="sz-caps min-w-0 truncate break-words text-[var(--sz-text-muted)]" :title="recommendation.title ?? undefined">{{ recommendation.title }}</h2>
          </div>
        </template>
        <template #actions>
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('recommendations.editAria', { title: recommendation.title ?? '' })"
            @click="startEdit(recommendation)"
          />
        </template>

        <p v-if="recommendation.lead" class="mb-2 text-[12.5px] text-[var(--sz-text-muted)]">
          {{ recommendation.lead }}
        </p>
        <dl v-if="recommendation.rows?.length" class="divide-y divide-[var(--sz-border)] border-t border-[var(--sz-border)]">
          <div
            v-for="row in recommendation.rows"
            :key="row.k"
            class="grid gap-1 py-2 sm:grid-cols-[9rem_1fr] sm:gap-3"
          >
            <dt class="text-[11px] uppercase tracking-[0.1em] text-[var(--sz-text-muted)]">{{ row.k }}</dt>
            <dd>
              <p class="text-[12.5px] font-medium">{{ row.v }}</p>
              <p v-if="row.d" class="text-[11px] text-[var(--sz-text-muted)]">{{ row.d }}</p>
            </dd>
          </div>
        </dl>
        <p v-else class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('recommendations.emptyRows') }}</p>
      </DossierPane>
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
