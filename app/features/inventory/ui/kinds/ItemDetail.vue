<script setup lang="ts">
import { ItemCard, findDetailsCard } from '~/entities/item';

const props = defineProps<{
  row: object;
  detailKind: 'weapon' | 'armor' | 'artifact';
}>();

defineEmits<{ edit: []; fill: []; close: [] }>();

const { t } = useI18n();
const { payload } = useProfile();

const PREFIX = { weapon: 'w', armor: 'a', artifact: 'art' } as const;

type DetailRow = { name: string; ownedId?: number | null; lvl?: number | null };

const data = computed(() => props.row as DetailRow);
const owned = computed(() => data.value.ownedId != null);
const card = computed(() =>
  findDetailsCard(payload.value?.details, PREFIX[props.detailKind], data.value.name),
);
</script>

<template>
  <div>
    <ItemCard
      :name="data.name"
      :kind="detailKind"
      :data="data"
      :card="card"
      :level="data.lvl ?? null"
    />
    <div v-if="owned" class="mt-3 border-t border-[var(--sz-border)] pt-3">
      <UButton
        icon="i-lucide-pencil"
        color="neutral"
        variant="outline"
        size="xs"
        :label="t('common.edit')"
        @click="$emit('edit')"
      />
    </div>
  </div>
</template>
