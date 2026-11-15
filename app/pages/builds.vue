<script setup lang="ts">
import type { BuildPayload } from '~/composables/useDossier';

useHead({ title: 'Сборки — STALZONE Dossier' });

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

const rowColumns = [
  { accessorKey: 'name', header: 'Предмет', meta: { class: { td: 'font-medium min-w-40' } } },
  { accessorKey: 'q', header: 'Качество' },
  { accessorKey: 'price', header: 'Лот', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { accessorKey: 'eff', header: 'Эффект', meta: { class: { td: 'min-w-40' } } },
  { accessorKey: 'bonus', header: 'Плюсы' },
  { accessorKey: 'minus', header: 'Минусы' },
  { accessorKey: 'why', header: 'Почему', meta: { class: { td: 'min-w-56 text-muted' } } },
  { accessorKey: 'rank', header: 'Ранг' },
];
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Сборки</h1>
        <p class="text-sm text-muted">
          {{ items.length }} шт.
          <span v-if="builds?.updated"> · обновлено {{ formatDate(builds.updated) }}</span>
        </p>
      </div>
      <FreshnessBadge
        :data-updated="payload?.freshness.dataUpdated"
        :prices-age-min="payload?.freshness.pricesAgeMin"
      />
    </div>

    <UAlert
      v-if="builds?.priceNote"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="О ценах"
      :description="builds.priceNote"
    />

    <UCard v-if="current">
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <UIcon name="i-lucide-package-check" class="size-5 text-primary" />
          <h2 class="font-medium">{{ current.title ?? 'Текущий набор' }}</h2>
        </div>
      </template>
      <p v-if="current.note" class="text-sm text-muted">{{ current.note }}</p>
      <ul v-if="current.rows?.length" class="mt-3 flex flex-wrap gap-1">
        <li v-for="row in current.rows" :key="row.name">
          <UBadge color="neutral" variant="subtle">{{ row.name }} · +{{ row.lvl }}</UBadge>
        </li>
      </ul>
    </UCard>

    <div v-if="items.length" class="space-y-4">
      <UCard v-for="build in items" :key="build.id">
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-lg font-semibold">{{ build.title }}</h2>
                <UBadge v-if="build.tag" color="primary" variant="subtle">{{ build.tag }}</UBadge>
              </div>
              <p v-if="build.short" class="text-sm text-muted">{{ build.short }}</p>
              <p v-if="build.goal" class="mt-1 text-sm">{{ build.goal }}</p>
            </div>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt class="text-xs text-muted">Контейнер</dt>
                <dd>{{ build.container ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted">Слоты</dt>
                <dd class="tabular-nums">{{ build.slots ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted">Бюджет</dt>
                <dd class="tabular-nums">{{ fmtMoney(build.budget) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted">Итого</dt>
                <dd class="tabular-nums">{{ fmtMoney(build.total) }}</dd>
              </div>
            </dl>
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="`Изменить сборку ${build.title}`"
              @click="startEdit(build)"
            />
          </div>
        </template>

        <div class="space-y-4">
          <dl v-if="build.metrics.length" class="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
            <div v-for="metric in build.metrics" :key="metric.l" class="rounded-md bg-elevated/60 p-2">
              <dt class="text-xs text-muted">{{ metric.l }}</dt>
              <dd class="font-medium tabular-nums">{{ metric.v }}</dd>
              <dd v-if="metric.s" class="text-xs text-muted">{{ metric.s }}</dd>
            </div>
          </dl>

          <div class="overflow-x-auto">
            <UTable
              :data="build.rows"
              :columns="rowColumns"
              :on-select="(_event, row) => openRow(row.original)"
            >
              <template #price-cell="{ row }">
                <PriceCell :price="row.original.price" :lots="row.original.lots" />
              </template>
              <template #rank-cell="{ row }">
                <RankBadge :rank="row.original.rank" />
              </template>
              <template #empty>
                <span class="text-muted">нет данных о составе</span>
              </template>
            </UTable>
          </div>

          <UAlert
            v-if="build.verdict"
            color="primary"
            variant="subtle"
            icon="i-lucide-message-square-quote"
            title="Вывод"
            :description="build.verdict"
          />
        </div>
      </UCard>
    </div>
    <UEmpty
      v-else
      icon="i-lucide-layers"
      title="Пусто"
      description="В досье пока нет сборок. Добавьте их через API или MCP."
    />

    <UCard v-if="avoid.length">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-triangle-alert" class="size-5 text-warning" />
          <h2 class="font-medium">Чего избегать</h2>
        </div>
      </template>
      <ul class="space-y-2 text-sm">
        <li v-for="item in avoid" :key="item.name">
          <span class="font-medium">{{ item.name }}</span>
          <span class="text-muted"> — {{ item.why }}</span>
        </li>
      </ul>
    </UCard>

    <p class="text-xs text-muted">
      Клик по строке открывает карточку предмета. Цены — минимальный лот на аукционе, показан только для чтения.
    </p>

    <UModal v-model:open="modalOpen" title="Карточка предмета" :description="selected?.name" scrollable>
      <template #body>
        <ItemCard
          v-if="selected"
          :name="selected.name"
          :kind="selected.kind"
          :card="selected.card"
        />
      </template>
    </UModal>

    <EditBuildModal v-model:open="buildOpen" :build="buildTarget" :container-options="containerOptions" />
  </section>
</template>
