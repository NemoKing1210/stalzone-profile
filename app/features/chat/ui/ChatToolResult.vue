<script setup lang="ts">
import { ItemIconFallback, RankBadge, VirtualBadge } from '~/entities/item';
import { chatToolView } from '../model/render';

const props = defineProps<{ toolName: string; payload: unknown }>();
const { t } = useI18n();
const { num } = useFormat();
const view = computed(() => chatToolView(props.toolName, props.payload));
</script>

<template>
  <div class="border border-[var(--sz-border)] bg-[var(--sz-surface)] p-2.5 text-[12.5px]">
    <p class="sz-caps mb-1.5 text-[10.5px] text-[var(--sz-text-muted)]">{{ toolName }}</p>

    <div v-if="view.kind === 'items'" class="grid gap-1.5 sm:grid-cols-2">
      <div
        v-for="item in view.items"
        :key="`${item.name}-${item.rank}`"
        class="flex min-w-0 items-center gap-2 border border-[var(--sz-border)] px-2 py-1.5"
      >
        <img v-if="item.icon" :src="item.icon" alt="" width="22" height="22" loading="lazy" class="size-[22px] object-contain">
        <ItemIconFallback v-else :size="16" />
        <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
        <RankBadge v-if="item.rank" :rank="item.rank" />
      </div>
    </div>

    <table v-else-if="view.kind === 'prices'" class="w-full text-[12px]">
      <thead class="text-[var(--sz-text-muted)]">
        <tr>
          <th class="text-left font-normal">{{ t('chat.columns.name') }}</th>
          <th class="text-right font-normal">{{ t('chat.columns.price') }}</th>
          <th class="text-right font-normal">{{ t('chat.columns.lots') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in view.prices" :key="row.name" class="border-t border-[var(--sz-border)]">
          <td class="py-0.5">{{ row.name }}</td>
          <td class="py-0.5 text-right tabular-nums">{{ row.price == null ? t('chat.noLot') : num(row.price) }}</td>
          <td class="py-0.5 text-right tabular-nums">{{ row.lots ?? '—' }}</td>
        </tr>
      </tbody>
    </table>

    <table v-else-if="view.kind === 'inventory'" class="w-full text-[12px]">
      <thead class="text-[var(--sz-text-muted)]">
        <tr>
          <th class="text-left font-normal">{{ t('chat.columns.name') }}</th>
          <th class="text-right font-normal">{{ t('chat.columns.level') }}</th>
          <th class="text-right font-normal">{{ t('chat.columns.qty') }}</th>
          <th class="text-left font-normal">{{ t('chat.columns.location') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in view.rows" :key="`${row.name}-${index}`" class="border-t border-[var(--sz-border)]">
          <td class="py-0.5"><span class="inline-flex items-center gap-1">{{ row.name }}<VirtualBadge v-if="row.virtual" /></span></td>
          <td class="py-0.5 text-right tabular-nums">{{ row.level }}</td>
          <td class="py-0.5 text-right tabular-nums">{{ row.qty }}</td>
          <td class="py-0.5">{{ row.location }}</td>
        </tr>
      </tbody>
    </table>

    <p v-else-if="view.kind === 'text'" class="text-[var(--sz-text)]">{{ view.text }}</p>
    <pre v-else class="max-h-56 overflow-auto whitespace-pre-wrap text-[11px] text-[var(--sz-text-muted)]">{{ view.json }}</pre>
  </div>
</template>
