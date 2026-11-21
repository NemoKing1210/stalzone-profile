<script setup lang="ts">
import type { ChatPriceView } from '../model/render';

defineProps<{ prices: ChatPriceView[] }>();

const { t } = useI18n();
const { num } = useFormat();
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full min-w-[17rem] text-[12px] [&_td]:px-1.5 [&_td]:py-1 [&_th]:px-1.5 [&_th]:py-1">
      <thead class="text-[var(--sz-text-muted)]">
        <tr>
          <th class="text-left font-normal">{{ t('chat.columns.name') }}</th>
          <th class="text-right font-normal">{{ t('chat.columns.price') }}</th>
          <th class="text-right font-normal">{{ t('chat.columns.lots') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in prices" :key="`${row.name}-${row.quality ?? ''}`" class="border-t border-[var(--sz-border)]">
          <td>{{ row.name }}</td>
          <td class="text-right tabular-nums">{{ row.price == null ? t('chat.noLot') : num(row.price) }}</td>
          <td class="text-right tabular-nums">{{ row.lots ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
