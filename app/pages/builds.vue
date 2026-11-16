<script setup lang="ts">
import type { BuildPayload } from '~/composables/useDossier';

const { t } = useI18n();
useHead(() => ({ title: `${t('builds.pageTitle')} — ${t('common.appName')}` }));

type BuildRow = BuildPayload['rows'][number];

interface Selection {
  name: string;
  kind: 'weapon' | 'armor' | 'artifact' | 'container';
  card: Record<string, unknown> | null;
}

const { payload } = useDossier();
const { fmtMoney, formatDate } = useFormat();
const builds = computed(() => payload.value?.builds);
const items = computed(() => builds.value?.items ?? []);
const current = computed(() => builds.value?.current ?? null);
const avoid = computed(() => builds.value?.avoid ?? []);
const details = computed(() => payload.value?.details ?? {});
const containerOptions = computed(() =>
  (payload.value?.containers ?? []).map((container) => container.name),
);
const buildTarget = ref<BuildPayload | null>(null);
const buildOpen = computed({
  get: () => buildTarget.value !== null,
  set: (value: boolean) => {
    if (!value) buildTarget.value = null;
  },
});

function startEdit(build: BuildPayload): void {
  buildTarget.value = build;
}

const selected = ref<Selection | null>(null);
const modalOpen = computed({
  get: () => selected.value !== null,
  set: (value: boolean) => {
    if (!value) selected.value = null;
  },
});

function openRow(row: BuildRow): void {
  const found = findAnyDetailsCard(details.value, row.name);
  selected.value = {
    name: row.name,
    kind: found?.kind ?? 'artifact',
    card: found?.card ?? null,
  };
}

const rowColumns = computed(() => [
  { accessorKey: 'name', header: t('builds.columns.item'), meta: { class: { td: 'font-medium min-w-40' } } },
  { accessorKey: 'q', header: t('builds.columns.quality') },
  { accessorKey: 'price', header: t('builds.columns.lot'), meta: { class: { th: 'text-right', td: 'text-right' } } },
  { accessorKey: 'eff', header: t('builds.columns.effect'), meta: { class: { td: 'min-w-40' } } },
  { accessorKey: 'bonus', header: t('builds.columns.plus') },
  { accessorKey: 'minus', header: t('builds.columns.minus') },
  { accessorKey: 'why', header: t('builds.columns.why'), meta: { class: { td: 'min-w-56 text-muted' } } },
  { accessorKey: 'rank', header: t('builds.columns.rank') },
]);
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{{ t('builds.title') }}</h1>
        <p class="text-[12.5px] text-[var(--sz-text-muted)]">
          {{ t('builds.count', { count: items.length }) }}
          <span v-if="builds?.updated"> · {{ t('builds.updated', { date: formatDate(builds.updated) }) }}</span>
        </p>
      </div>
    </div>

    <UAlert
      v-if="builds?.priceNote"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :title="t('builds.pricesTitle')"
      :description="builds.priceNote"
    />

    <DossierPane v-if="current" :title="current.title ?? t('builds.currentFallback')" dense>
      <p v-if="current.note" class="text-[12.5px] text-[var(--sz-text-muted)]">{{ current.note }}</p>
      <ul v-if="current.rows?.length" class="mt-2 flex flex-wrap gap-1">
        <li v-for="row in current.rows" :key="row.name">
          <span class="border border-[var(--sz-border)] px-1.5 py-0.5 text-[11px] uppercase tracking-[0.1em]">
            {{ row.name }} · +{{ row.lvl }}
          </span>
        </li>
      </ul>
    </DossierPane>

    <div v-if="items.length" class="space-y-4">
      <DossierPane v-for="build in items" :key="build.id" :label="build.title" dense>
        <template #header>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <h2 class="sz-caps truncate text-[var(--sz-text-muted)]" :title="build.title">{{ build.title }}</h2>
            <span
              v-if="build.tag"
              class="border border-[var(--sz-border)] px-1.5 py-0.5 text-[11px] uppercase leading-none tracking-[0.12em] text-[var(--sz-accent)]"
            >
              {{ build.tag }}
            </span>
          </div>
        </template>
        <template #actions>
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('builds.editAria', { title: build.title })"
            @click="startEdit(build)"
          />
        </template>

        <div class="space-y-3">
          <div v-if="build.short || build.goal" class="space-y-1">
            <p v-if="build.short" class="text-[12.5px] text-[var(--sz-text-muted)]">{{ build.short }}</p>
            <p v-if="build.goal" class="text-[12.5px]">{{ build.goal }}</p>
          </div>

          <div class="grid grid-cols-2 gap-x-4 border-y border-[var(--sz-border)] py-1 sm:grid-cols-4">
            <StatRow :label="t('builds.container')" :value="build.container ?? '—'" />
            <StatRow :label="t('builds.slots')" :value="build.slots ?? '—'" />
            <StatRow :label="t('builds.budget')" :value="fmtMoney(build.budget)" />
            <StatRow :label="t('builds.total')" :value="fmtMoney(build.total)" />
          </div>

          <dl v-if="build.metrics.length" class="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div
              v-for="metric in build.metrics"
              :key="metric.l"
              class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 py-1"
            >
              <dt class="sz-caps text-[11px] text-[var(--sz-text-muted)]">{{ metric.l }}</dt>
              <dd class="text-[12.5px] font-medium tabular-nums">{{ metric.v }}</dd>
              <dd v-if="metric.s" class="text-[11px] text-[var(--sz-text-muted)]">{{ metric.s }}</dd>
            </div>
          </dl>

          <div class="overflow-x-auto">
            <UTable
              :data="build.rows"
              :columns="rowColumns"
              :on-select="(_event, row) => openRow(row.original)"
              class="min-w-[720px]"
              :ui="{ td: 'whitespace-normal align-top' }"
            >
              <template #price-cell="{ row }">
                <PriceCell :price="row.original.price" :lots="row.original.lots" />
              </template>
              <template #rank-cell="{ row }">
                <RankBadge :rank="row.original.rank" />
              </template>
              <template #empty>
                <span class="text-[var(--sz-text-muted)]">{{ t('builds.emptyRows') }}</span>
              </template>
            </UTable>
          </div>

          <UAlert
            v-if="build.verdict"
            color="primary"
            variant="subtle"
            icon="i-lucide-message-square-quote"
            :title="t('builds.verdict')"
            :description="build.verdict"
          />
        </div>
      </DossierPane>
    </div>
    <UEmpty
      v-else
      icon="i-lucide-layers"
      :title="t('common.empty')"
      :description="t('builds.emptyDescription')"
    />

    <DossierPane v-if="avoid.length" :title="t('builds.avoidTitle')" dense>
      <ul class="divide-y divide-[var(--sz-border)]">
        <li v-for="item in avoid" :key="item.name" class="py-1.5 text-[12.5px]">
          <span class="font-medium">{{ item.name }}</span>
          <span class="text-[var(--sz-text-muted)]">: {{ item.why }}</span>
        </li>
      </ul>
    </DossierPane>

    <p class="text-[11px] text-[var(--sz-text-dim)]">
      {{ t('builds.hint') }}
    </p>

    <UModal v-model:open="modalOpen" :title="t('items.cardTitle')" :description="selected?.name" scrollable>
      <template #body>
        <ItemCard
          v-if="selected"
          :name="selected.name"
          :kind="selected.kind"
          :card="selected.card"
        />
      </template>
      <template #footer>
        <KeyHint :keys="['Esc']" :label="t('common.close')" />
      </template>
    </UModal>

    <EditBuildModal v-model:open="buildOpen" :build="buildTarget" :container-options="containerOptions" />
  </section>
</template>
