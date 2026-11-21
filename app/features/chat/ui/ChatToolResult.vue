<script setup lang="ts">
import { ProfileItemCard } from '~/entities/item';
import { chatToolView, type ChatItemView } from '../model/render';

const props = defineProps<{ toolName: string; payload: unknown }>();
const emit = defineEmits<{ openItem: [item: ChatItemView] }>();

const { t } = useI18n();
const { num } = useFormat();
const view = computed(() => chatToolView(props.toolName, props.payload));

/** The two facts a card adds to the entity card; weight and level already sit there. */
function statsOf(item: ChatItemView): { label: string; value: string }[] {
  const stats: { label: string; value: string }[] = [];
  if (item.qty != null) stats.push({ label: t('chat.columns.qty'), value: String(item.qty) });
  if (item.location) stats.push({ label: t('chat.columns.location'), value: item.location });
  return stats;
}
</script>

<template>
  <div class="text-[12.5px]">
    <div v-if="view.kind === 'items'" class="grid gap-1.5 sm:grid-cols-2">
      <ProfileItemCard
        v-for="(item, index) in view.items"
        :key="item.instanceId ?? `${item.name}-${index}`"
        :name="item.name"
        :rank="item.rank"
        :category="item.category"
        :level="item.level"
        :icon="item.icon"
        :virtual="item.virtual"
        :stats="statsOf(item)"
        :priority="index < 4"
        open-on-click
        @open="emit('openItem', item)"
      />
    </div>

    <div v-else-if="view.kind === 'prices'" class="overflow-x-auto">
      <table class="w-full min-w-[17rem] text-[12px] [&_td]:px-1.5 [&_td]:py-1 [&_th]:px-1.5 [&_th]:py-1">
        <thead class="text-[var(--sz-text-muted)]">
          <tr>
            <th class="text-left font-normal">{{ t('chat.columns.name') }}</th>
            <th class="text-right font-normal">{{ t('chat.columns.price') }}</th>
            <th class="text-right font-normal">{{ t('chat.columns.lots') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in view.prices" :key="row.name" class="border-t border-[var(--sz-border)]">
            <td>{{ row.name }}</td>
            <td class="text-right tabular-nums">{{ row.price == null ? t('chat.noLot') : num(row.price) }}</td>
            <td class="text-right tabular-nums">{{ row.lots ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else-if="view.kind === 'text'" class="text-[12.5px] leading-relaxed text-[var(--sz-text)]">{{ view.text }}</p>
    <pre v-else class="max-h-56 overflow-auto whitespace-pre-wrap text-[11px] text-[var(--sz-text-muted)]">{{
      view.json
    }}</pre>
  </div>
</template>
