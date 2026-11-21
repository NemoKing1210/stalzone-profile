<script setup lang="ts">
import type { DetailRow } from '../../model/details';
import type { PickerItem } from '../../model/itemPicker';

import { ItemIconFallback, RankBadge, RarityName } from '~/entities/item';
import { itemEdgeColor } from '~/shared/lib/rankBorder';

import { detailRows } from '../../model/details';
import { categoryLabel } from '../../model/itemPicker';

const props = withDefaults(
  defineProps<{
    item: PickerItem | null;
    /** Owned instances of the same catalog row. */
    owned?: number;
  }>(),
  { owned: 0 },
);

const { t } = useI18n();
const { g1, g2, num } = useFormat();

/** The detail card prefixes the payload uses; only these kinds have a catalog card. */
const CARD_PREFIX: Record<string, string> = { weapon: 'w', armor: 'a', artifact: 'art', container: 'c' };

const request = useRequestFetch();
const cards = ref(new Map<string, Record<string, unknown> | null>());
const loadingKey = ref<string | null>(null);

const cardKey = computed(() => {
  const item = props.item;
  const prefix = item ? CARD_PREFIX[item.kind] : undefined;
  return item && prefix ? `${prefix}:${item.name}` : null;
});

watch(
  () => props.item,
  async (item) => {
    const key = cardKey.value;
    if (!item || !key || cards.value.has(key)) return;
    loadingKey.value = key;
    try {
      const response = await request<{ data?: Record<string, unknown> }>(`/api/v1/details/${encodeURIComponent(key)}`);
      cards.value.set(key, response?.data ?? null);
    } catch {
      cards.value.set(key, null);
    } finally {
      if (loadingKey.value === key) loadingKey.value = null;
    }
  },
  { immediate: true },
);

const card = computed(() => (cardKey.value ? (cards.value.get(cardKey.value) ?? null) : null));
const loading = computed(() => loadingKey.value !== null && loadingKey.value === cardKey.value);

const rows = computed<DetailRow[]>(() =>
  props.item
    ? detailRows(props.item.kind, { row: props.item as unknown as Record<string, unknown>, card: card.value }).filter(
        // The header already carries the weight chip; repeating it in the card is noise.
        (row) => row.key !== 'weight',
      )
    : [],
);

function formatRow(row: DetailRow): string {
  if (typeof row.value !== 'number') return row.value;
  if (row.key === 'weight') return t('items.weightValue', { value: g2(row.value) });
  if (row.key === 'eff') return `${g1(row.value)}%`;
  if (row.key === 'rarityPct') return `${g2(row.value)}%`;
  return Number.isInteger(row.value) ? num(row.value) : g2(row.value);
}
</script>

<template>
  <section v-if="props.item" class="min-w-0 space-y-2">
    <header class="flex items-start gap-2.5 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] p-2">
      <span
        class="sz-hatch sz-hatch--fine flex size-16 shrink-0 items-center justify-center border bg-[var(--sz-surface)]"
        :style="{ borderColor: itemEdgeColor(props.item.rank) }"
      >
        <img
          v-if="props.item.icon"
          :src="props.item.icon"
          alt=""
          width="56"
          height="56"
          loading="lazy"
          class="max-h-14 max-w-full object-contain"
        >
        <ItemIconFallback v-else :size="34" />
      </span>

      <div class="min-w-0 flex-1">
        <p class="flex flex-wrap items-center gap-1.5">
          <RarityName :name="props.item.name" :rank="props.item.rank" size="lg" />
          <span
            v-if="props.owned"
            class="border border-[var(--sz-border)] px-1 py-px text-[10px] leading-none tabular-nums text-[var(--sz-text-muted)]"
          >×{{ props.owned }}</span>
        </p>
        <p v-if="props.item.nameEn" class="truncate text-[11px] text-[var(--sz-text-dim)]">{{ props.item.nameEn }}</p>
        <p class="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-[var(--sz-text-muted)]">
          <span>{{ t(`inventory.filterKinds.${props.item.kind}`) }}</span>
          <template v-if="categoryLabel(props.item.category)">
            <span aria-hidden="true">·</span>
            <span class="truncate">{{ categoryLabel(props.item.category) }}</span>
          </template>
          <template v-if="props.item.slot">
            <span aria-hidden="true">·</span>
            <span class="truncate">{{ props.item.slot }}</span>
          </template>
        </p>
        <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <RankBadge :rank="props.item.rank" />
          <span
            v-if="props.item.weight != null"
            class="text-[11px] tabular-nums text-[var(--sz-text-muted)]"
          >{{ t('items.weightValue', { value: g2(props.item.weight) }) }}</span>
        </div>
      </div>
    </header>

    <dl v-if="rows.length" class="divide-y divide-[var(--sz-border)] border border-[var(--sz-border)] px-2">
      <div v-for="row in rows" :key="row.key" class="flex items-baseline justify-between gap-3 py-1 text-[12px]">
        <dt class="text-[var(--sz-text-muted)]">{{ t(row.labelKey) }}</dt>
        <dd class="truncate text-right tabular-nums">{{ formatRow(row) }}</dd>
      </div>
    </dl>
    <div v-else-if="loading" class="space-y-1.5 border border-[var(--sz-border)] px-2 py-2">
      <span v-for="row in 3" :key="row" class="block h-2.5 animate-pulse bg-[var(--sz-surface-alt)]" />
    </div>
  </section>

  <p v-else class="border border-dashed border-[var(--sz-border)] px-3 py-4 text-[12px] text-[var(--sz-text-muted)]">
    {{ t('owned.selectHint') }}
  </p>
</template>
