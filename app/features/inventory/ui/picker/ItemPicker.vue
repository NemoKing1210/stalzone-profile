<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import type { ItemSummary } from '@profile/shared/contracts';
import { RANK_ORDER } from '@profile/shared/ranks';
import { useId } from 'vue';

import { ItemIconFallback, RankBadge } from '~/entities/item';
import { itemEdgeColor } from '~/shared/lib/rankBorder';
import { rankTextColor } from '~/shared/lib/rankText';
import { categoryLabel, highlightSegments, isOwnableCatalogItem, nextSelectionIndex } from '../../model/itemPicker';

const props = withDefaults(
  defineProps<{
    /** A fixed owned kind, or `all` for the cross-kind catalog. */
    kind: string;
    /** The add modal is open; the catalog query stays idle otherwise. */
    active: boolean;
    /** Owned instance counts by catalog name. */
    owned?: ReadonlyMap<string, number>;
  }>(),
  { owned: () => new Map() },
);

const selected = defineModel<ItemSummary | null>({ default: null });
const { t } = useI18n();
const { g2 } = useFormat();

const search = ref('');
const debouncedSearch = ref('');
const rank = ref('all');
const activeIndex = ref(-1);
const listId = useId();

const rankItems = computed(() => [
  { label: t('filters.allRanks'), value: 'all' },
  ...RANK_ORDER.map((key) => ({ label: t(`ranks.${key}`), value: key })),
]);

const request = useRequestFetch();
const { data: page, isLoading } = useQuery({
  key: () => ['catalog', 'picker', props.kind, rank.value, debouncedSearch.value],
  query: () =>
    request<ItemSummary[]>('/api/v1/items', {
      query: {
        q: debouncedSearch.value || undefined,
        ...(props.kind === 'all' ? {} : { kind: props.kind }),
        ...(rank.value === 'all' ? {} : { rank: rank.value }),
        limit: 50,
      },
    }),
  enabled: () => props.active,
});

/** Only the seven ownable kinds reach the form; motifs and cosmetic variants stay catalog-only. */
const items = computed(() => (page.value ?? []).filter(isOwnableCatalogItem));

const activeItem = computed(() => items.value[activeIndex.value] ?? null);

const optionId = (index: number): string => `${listId}-option-${index}`;

let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));

watch(search, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    debouncedSearch.value = search.value.trim();
  }, 200);
});

watch([debouncedSearch, rank, () => props.kind], () => {
  activeIndex.value = items.value.length ? 0 : -1;
});

watch(items, (list) => {
  activeIndex.value = list.length ? 0 : -1;
});

watch(selected, (item) => {
  if (!item) return;
  activeIndex.value = items.value.findIndex((entry) => entry.id === item.id);
});

watch(() => props.active, (open) => {
  if (!open) return;
  search.value = '';
  debouncedSearch.value = '';
  rank.value = 'all';
  activeIndex.value = -1;
});

watch(activeIndex, async (index) => {
  if (index < 0 || !import.meta.client) return;
  await nextTick();
  document.getElementById(optionId(index))?.scrollIntoView({ block: 'nearest' });
});

function choose(item: ItemSummary): void {
  selected.value = item;
}

function move(delta: number): void {
  activeIndex.value = nextSelectionIndex(activeIndex.value, delta, items.value.length);
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
  } else if (event.key === 'Enter') {
    // Enter belongs to the picker: it must never submit the add form before a row is chosen.
    event.preventDefault();
    if (activeItem.value) choose(activeItem.value);
  }
}
</script>

<template>
  <div class="min-w-0 space-y-2">
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
      <UInput
        v-model="search"
        :placeholder="t('owned.searchItem')"
        icon="i-lucide-search"
        autocomplete="off"
        role="combobox"
        :aria-expanded="true"
        :aria-controls="listId"
        :aria-activedescendant="activeIndex >= 0 ? optionId(activeIndex) : undefined"
        :ui="{ base: 'pe-8' }"
        class="min-w-0 flex-1"
        @keydown="onSearchKeydown"
      >
        <template v-if="search" #trailing>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="link"
            size="xs"
            :aria-label="t('owned.clearSearch')"
            @click="search = ''"
          />
        </template>
      </UInput>
      <USelect v-model="rank" :items="rankItems" size="sm" class="w-36" :aria-label="t('filters.rank')" />
    </div>

    <div
      :id="listId"
      role="listbox"
      :aria-label="t('owned.itemsList')"
      class="max-h-[21rem] overflow-y-auto border border-[var(--sz-border)] lg:max-h-[26rem]"
    >
      <template v-if="isLoading && !items.length">
        <div v-for="row in 4" :key="row" class="flex items-center gap-2.5 border-b border-[var(--sz-border)] px-2.5 py-2 last:border-b-0">
          <span class="size-10 shrink-0 animate-pulse bg-[var(--sz-surface-alt)]" />
          <span class="min-w-0 flex-1 space-y-1.5">
            <span class="block h-2.5 w-2/3 animate-pulse bg-[var(--sz-surface-alt)]" />
            <span class="block h-2 w-1/3 animate-pulse bg-[var(--sz-surface-alt)]" />
          </span>
        </div>
      </template>
      <div v-else-if="!items.length" class="space-y-1 px-3 py-4">
        <p class="text-[12px] text-[var(--sz-text-muted)]">{{ t('owned.noItems') }}</p>
        <p class="text-[11px] text-[var(--sz-text-dim)]">{{ t('owned.noItemsHint') }}</p>
      </div>
      <template v-else>
        <button
          v-for="(item, index) in items"
          :id="optionId(index)"
          :key="item.id"
          type="button"
          role="option"
          :aria-selected="selected?.id === item.id"
          class="grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[var(--sz-border)] px-2.5 py-1.5 text-left transition-colors duration-100 last:border-b-0"
          :class="
            selected?.id === item.id
              ? 'bg-[var(--sz-surface-alt)] shadow-[inset_2px_0_0_var(--sz-accent)]'
              : activeIndex === index
                ? 'bg-[var(--sz-surface-alt)]'
                : 'hover:bg-[var(--sz-surface-alt)]'
          "
          @click="choose(item)"
          @mouseenter="activeIndex = index"
        >
          <span
            class="sz-hatch sz-hatch--fine relative flex size-10 shrink-0 items-center justify-center border bg-[var(--sz-surface-alt)]"
            :style="{ borderColor: itemEdgeColor(item.rank) }"
          >
            <img
              v-if="item.icon"
              :src="item.icon"
              alt=""
              width="32"
              height="32"
              loading="lazy"
              class="max-h-8 max-w-full object-contain"
            >
            <ItemIconFallback v-else :size="22" />
          </span>

          <span class="min-w-0">
            <span class="flex items-center gap-1.5">
              <span class="truncate text-[13px] font-medium leading-snug" :style="{ color: rankTextColor(item.rank) }">
                <span
                  v-for="(segment, part) in highlightSegments(item.name, debouncedSearch)"
                  :key="part"
                  :class="segment.match ? 'underline decoration-2 underline-offset-2 decoration-[var(--sz-accent)]' : ''"
                >{{ segment.text }}</span>
              </span>
              <span
                v-if="props.owned.get(item.name)"
                class="shrink-0 border border-[var(--sz-border)] px-1 py-px text-[10px] leading-none tabular-nums text-[var(--sz-text-muted)]"
              >×{{ props.owned.get(item.name) }}</span>
            </span>
            <span class="mt-0.5 flex items-baseline gap-x-1.5 text-[11px] text-[var(--sz-text-dim)]">
              <span class="truncate">
                {{ t(`inventory.filterKinds.${item.kind}`) }}<template v-if="categoryLabel(item.category)">
                  · {{ categoryLabel(item.category) }}</template>
              </span>
              <span v-if="item.weight != null" class="ml-auto shrink-0 tabular-nums">
                {{ t('items.weightValue', { value: g2(item.weight) }) }}
              </span>
            </span>
          </span>

          <RankBadge :rank="item.rank" />
        </button>
      </template>
    </div>

    <p v-if="!isLoading && items.length" class="text-right text-[11px] tabular-nums text-[var(--sz-text-dim)]">
      {{ t('owned.resultsCount', { count: items.length }) }}
    </p>
  </div>
</template>
