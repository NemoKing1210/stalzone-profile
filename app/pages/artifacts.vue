<script setup lang="ts">
import type { ArtifactPayload } from '~/composables/useDossier';
import type { OwnedEditTarget } from '~/types/dossier';

const { t } = useI18n();
useHead(() => ({ title: `${t('artifacts.pageTitle')} — ${t('common.appName')}` }));

const { payload } = useDossier();
const filters = useFilters('artifacts', { q: '', type: 'all', sort: 'name' });
const selected = ref<ArtifactPayload | null>(null);
const editTarget = ref<OwnedEditTarget | null>(null);
const editOpen = computed({
  get: () => editTarget.value !== null,
  set: (value: boolean) => {
    if (!value) editTarget.value = null;
  },
});
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
  return [{ label: t('filters.allTypes'), value: 'all' }, ...types.map((type) => ({ label: type, value: type }))];
});

const sortItems = computed(() => [
  { label: t('artifacts.sortName'), value: 'name' },
  { label: t('artifacts.sortLevelDesc'), value: 'lvl-desc' },
  { label: t('artifacts.sortLevelAsc'), value: 'lvl-asc' },
  { label: t('artifacts.sortRank'), value: 'rank' },
]);

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

function startEdit(artifact: ArtifactPayload): void {
  if (artifact.ownedId == null) return;
  editTarget.value = {
    ownedId: artifact.ownedId,
    name: artifact.name,
    kind: 'artifact',
    level: artifact.lvl,
    qty: artifact.qty ?? 1,
    quality: artifact.quality ?? null,
    skin: artifact.skin ?? null,
    note: artifact.note ?? null,
    role: null,
    slot: null,
  };
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">{{ t('artifacts.title') }}</h1>
        <p class="text-sm text-muted">
          {{ t('artifacts.summary', { shown: filtered.length, total: artifacts.length }) }}
        </p>
      </div>
      <FreshnessBadge
        :data-updated="payload?.freshness.dataUpdated"
        :prices-age-min="payload?.freshness.pricesAgeMin"
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="filters.q"
        icon="i-lucide-search"
        :placeholder="t('filters.searchArtifacts')"
        class="w-full sm:w-72"
      />
      <USelect v-model="filters.type" :items="typeItems" class="w-52" :aria-label="t('filters.artifactType')" />
      <USelect v-model="filters.sort" :items="sortItems" class="w-64" :aria-label="t('filters.sort')" />
      <UButton
        v-if="filters.q || filters.type !== 'all'"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        :label="t('common.reset')"
        @click="
          () => {
            filters.q = '';
            filters.type = 'all';
          }
        "
      />
    </div>

    <div v-if="filtered.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div v-for="artifact in filtered" :key="`${artifact.name}-${artifact.lvl}`" class="relative">
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
              <p class="text-xs text-muted">{{ artifact.type ?? t('artifacts.typeFallback') }}</p>
              <div class="mt-1 flex flex-wrap gap-1">
                <RankBadge :rank="artifact.rank" />
                <UBadge v-if="artifact.q" color="neutral" variant="subtle">{{ artifact.q }}</UBadge>
                <UBadge color="neutral" variant="subtle">+{{ artifact.lvl }}</UBadge>
              </div>
            </div>
            <UButton
              v-if="artifact.ownedId"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              class="relative z-10"
              :aria-label="t('artifacts.editAria', { name: artifact.name })"
              @click="startEdit(artifact)"
            />
          </div>
          <p v-if="artifact.effects" class="mt-3 line-clamp-3 text-sm text-muted">{{ artifact.effects }}</p>
          <p v-else class="mt-3 text-sm text-muted">{{ t('artifacts.effectsEmpty') }}</p>
        </UCard>
        <button
          type="button"
          class="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :aria-label="t('artifacts.openAria', { name: artifact.name })"
          @click="selected = artifact"
        />
      </div>
    </div>
    <UEmpty
      v-else
      icon="i-lucide-gem"
      :title="t('common.empty')"
      :description="artifacts.length ? t('filters.noMatch') : t('artifacts.emptyDescription')"
    />

    <p class="text-xs text-muted">{{ t('artifacts.hint') }}</p>

    <UModal v-model:open="modalOpen" :title="t('items.artifactCardTitle')" :description="selected?.name" scrollable>
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

    <EditOwnedModal v-model:open="editOpen" :target="editTarget" />
  </section>
</template>
