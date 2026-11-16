<script setup lang="ts">
import type { ArtifactPayload } from '~/composables/useDossier';
import type { OwnedEditTarget } from '~/types/dossier';

const { t } = useI18n();
useHead(() => ({ title: `${t('artifacts.pageTitle')} — ${t('common.appName')}` }));

const { payload } = useDossier();
const filters = useFilters('artifacts', { q: '', type: 'all', sort: 'name', rank: ALL_RANKS });
const selected = ref<ArtifactPayload | null>(null);
const dialogOpen = ref(false);
const editTarget = ref<OwnedEditTarget | null>(null);
const editOpen = computed({
  get: () => editTarget.value !== null,
  set: (value: boolean) => {
    if (!value) editTarget.value = null;
  },
});

const artifacts = computed(() => payload.value?.artifacts ?? []);
const rankItems = computed(() => rankOptions(t));

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
    if (filters.rank !== ALL_RANKS && artifact.rank !== filters.rank) return false;
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

function cardStats(artifact: ArtifactPayload): { label: string; value: string }[] {
  return [
    { label: '', value: artifact.q ?? '—' },
    { label: '', value: `+${artifact.lvl}` },
  ];
}

function selectArtifact(artifact: ArtifactPayload): void {
  selected.value = artifact;
  if (import.meta.client && window.matchMedia('(max-width: 1023px)').matches) dialogOpen.value = true;
}

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
        <h1>{{ t('artifacts.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ t('artifacts.summary', { shown: filtered.length, total: artifacts.length }) }}
        </p>
      </div>
    </div>

    <div v-if="artifacts.length" class="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <DossierPane :title="t('artifacts.filtersTitle')" dense>
        <div class="space-y-2">
          <UInput
            v-model="filters.q"
            icon="i-lucide-search"
            size="xs"
            :placeholder="t('filters.searchArtifacts')"
            class="w-full"
          />
          <USelect
            v-model="filters.type"
            :items="typeItems"
            size="xs"
            class="w-full"
            :aria-label="t('filters.artifactType')"
          />
          <USelect
            v-model="filters.rank"
            :items="rankItems"
            size="xs"
            class="w-full"
            :aria-label="t('filters.rank')"
          />
          <USelect
            v-model="filters.sort"
            :items="sortItems"
            size="xs"
            class="w-full"
            :aria-label="t('filters.sort')"
          />
          <UButton
            v-if="filters.q || filters.type !== 'all' || filters.rank !== ALL_RANKS"
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            :label="t('common.reset')"
            @click="
              () => {
                filters.q = '';
                filters.type = 'all';
                filters.rank = ALL_RANKS;
              }
            "
          />
          <p class="border-t border-[var(--sz-border)] pt-2 text-[11px] tabular-nums text-[var(--sz-text-dim)]">
            {{ filtered.length }} / {{ artifacts.length }}
          </p>
        </div>
      </DossierPane>

      <div class="space-y-4">
        <DossierPane
          :label="t('artifacts.title')"
          flush
          :hint="`${filtered.length} / ${artifacts.length}`"
        >
          <template #header>
            <span class="sz-caps truncate text-[var(--sz-text-muted)]">{{ t('artifacts.title') }}</span>
          </template>
          <div class="p-2">
            <div
              v-if="filtered.length"
              data-testid="artifact-grid"
              class="grid grid-cols-1 gap-2 lg:grid-cols-2"
            >
              <DossierItemCard
                v-for="(artifact, index) in filtered"
                :key="`${artifact.name}-${artifact.lvl}`"
                :name="artifact.name"
                :rank="artifact.rank"
                :category="artifact.type"
                :icon="artifact.icon"
                :description="artifact.effects ?? undefined"
                :stats="cardStats(artifact)"
                :selected="selected?.name === artifact.name && selected?.lvl === artifact.lvl"
                :priority="index === 0"
                @select="selectArtifact(artifact)"
              />
            </div>
            <UEmpty
              v-else
              icon="i-lucide-gem"
              :title="t('common.empty')"
              :description="artifacts.length ? t('filters.noMatch') : t('artifacts.emptyDescription')"
            />
          </div>
        </DossierPane>

        <DossierPane :title="t('artifacts.detailTitle')" dense>
          <template v-if="selected?.ownedId" #actions>
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('artifacts.editAria', { name: selected.name })"
              @click="startEdit(selected)"
            />
          </template>

          <ItemCard
            v-if="selected"
            :name="selected.name"
            kind="artifact"
            :data="selected"
            :card="selectedCard"
            :level="selected.lvl"
          />
          <p v-else class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('artifacts.noSelection') }}</p>
        </DossierPane>
      </div>
    </div>

    <UEmpty
      v-else
      icon="i-lucide-gem"
      :title="t('common.empty')"
      :description="t('artifacts.emptyDescription')"
    />

    <p class="text-[11px] text-[var(--sz-text-dim)]">{{ t('artifacts.hint') }}</p>

    <UModal
      v-model:open="dialogOpen"
      :title="t('items.artifactCardTitle')"
      :description="selected?.name"
      scrollable
    >
      <template #body>
        <ItemCard
          v-if="selected"
          :name="selected.name"
          kind="artifact"
          :data="selected"
          :card="selectedCard"
          :level="selected.lvl"
        />
        <div v-if="selected?.ownedId" class="mt-3 border-t border-[var(--sz-border)] pt-3">
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            size="xs"
            :label="t('common.edit')"
            @click="startEdit(selected)"
          />
        </div>
      </template>
      <template #footer>
        <KeyHint :keys="['Esc']" :label="t('common.close')" />
      </template>
    </UModal>

    <EditOwnedModal v-model:open="editOpen" :target="editTarget" />
  </section>
</template>
