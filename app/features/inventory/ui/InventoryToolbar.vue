<script setup lang="ts">
import { ALL_RANKS } from '~/entities/item';

interface ToolbarOption {
  label: string;
  value: string;
}

interface InventoryFilterState {
  mode?: string;
  view: string;
  q: string;
  rank: string;
  type: string;
  group: string;
  sort: string;
  dir: string;
  hp?: number;
}

const props = defineProps<{
  filters: InventoryFilterState;
  modes?: { label: string; value: string; count: number }[];
  searchPlaceholder: string;
  rankItems: ToolbarOption[];
  typeItems: ToolbarOption[];
  typeLabel: string;
  sortItems: ToolbarOption[];
  groupItems?: ToolbarOption[];
  chartView?: boolean;
}>();

const emit = defineEmits<{ update: [patch: Partial<InventoryFilterState>] }>();

const { t } = useI18n();

const canReset = computed(
  () =>
    props.filters.q !== '' ||
    props.filters.rank !== ALL_RANKS ||
    props.filters.type !== 'all' ||
    props.filters.group !== 'none',
);

function update(patch: Partial<InventoryFilterState>): void {
  emit('update', patch);
}

function reset(): void {
  update({ q: '', rank: ALL_RANKS, type: 'all', group: 'none' });
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <div v-if="modes?.length" class="flex gap-1">
      <UButton
        v-for="mode in modes"
        :key="mode.value"
        size="xs"
        :color="filters.mode === mode.value ? 'primary' : 'neutral'"
        :variant="filters.mode === mode.value ? 'solid' : 'outline'"
        @click="update({ mode: mode.value })"
      >
        {{ mode.label }} · {{ mode.count }}
      </UButton>
    </div>

    <div class="flex gap-1">
      <UButton
        icon="i-lucide-layout-grid"
        size="xs"
        :color="filters.view === 'grid' ? 'primary' : 'neutral'"
        :variant="filters.view === 'grid' ? 'solid' : 'ghost'"
        :aria-label="t('common.viewGrid')"
        :aria-pressed="filters.view === 'grid'"
        @click="update({ view: 'grid' })"
      />
      <UButton
        icon="i-lucide-list"
        size="xs"
        :color="filters.view === 'list' ? 'primary' : 'neutral'"
        :variant="filters.view === 'list' ? 'solid' : 'ghost'"
        :aria-label="t('common.viewList')"
        :aria-pressed="filters.view === 'list'"
        @click="update({ view: 'list' })"
      />
      <UButton
        v-if="chartView"
        icon="i-lucide-chart-spline"
        size="xs"
        :color="filters.view === 'chart' ? 'primary' : 'neutral'"
        :variant="filters.view === 'chart' ? 'solid' : 'ghost'"
        :aria-label="t('common.viewChart')"
        :aria-pressed="filters.view === 'chart'"
        @click="update({ view: 'chart' })"
      />
    </div>

    <UInput
      :model-value="filters.q"
      icon="i-lucide-search"
      size="xs"
      :placeholder="searchPlaceholder"
      class="w-full sm:w-56"
      @update:model-value="(value) => update({ q: String(value) })"
    />
    <USelect
      :model-value="filters.type"
      :items="typeItems"
      size="xs"
      class="w-40"
      :aria-label="typeLabel"
      @update:model-value="(value) => update({ type: String(value) })"
    />
    <USelect
      :model-value="filters.rank"
      :items="rankItems"
      size="xs"
      class="w-36"
      :aria-label="t('filters.rank')"
      @update:model-value="(value) => update({ rank: String(value) })"
    />
    <USelect
      :model-value="filters.sort"
      :items="sortItems"
      size="xs"
      class="w-36"
      :aria-label="t('filters.sort')"
      @update:model-value="(value) => update({ sort: String(value) })"
    />
    <UButton
      :icon="filters.dir === 'desc' ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-narrow-wide'"
      size="xs"
      color="neutral"
      variant="ghost"
      :aria-label="t('filters.sort')"
      @click="update({ dir: filters.dir === 'desc' ? 'asc' : 'desc' })"
    />
    <USelect
      v-if="groupItems"
      :model-value="filters.group"
      :items="groupItems"
      size="xs"
      class="w-40"
      :aria-label="t('filters.group')"
      @update:model-value="(value) => update({ group: String(value) })"
    />
    <UButton
      v-if="canReset"
      icon="i-lucide-x"
      size="xs"
      color="neutral"
      variant="ghost"
      :label="t('common.reset')"
      @click="reset"
    />
  </div>
</template>
