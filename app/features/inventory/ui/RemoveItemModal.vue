<script setup lang="ts">
import { MODAL_WIDTH } from '~/shared/lib/modalWidth';

import { clampRemoveQty } from '../model/removal';

const open = defineModel<boolean>('open', { default: false });

const props = withDefaults(
  defineProps<{
    name: string;
    /** How many pieces the instance currently holds; stacks ask for a count, gear does not. */
    qty: number;
    loading?: boolean;
  }>(),
  { loading: false },
);

const emit = defineEmits<{ confirm: [qty: number] }>();
const { t } = useI18n();

const amount = ref(1);
const available = computed(() => Math.max(1, Math.trunc(Number.isFinite(props.qty) ? props.qty : 1)));
const chosen = computed(() => clampRemoveQty(available.value, amount.value));

watch(open, (value) => {
  if (value) amount.value = 1;
});

watch(available, (max) => {
  if (amount.value > max) amount.value = max;
});
</script>

<template>
  <UModal v-model:open="open" :title="t('inventory.removeItemTitle')" :ui="{ content: MODAL_WIDTH.narrow }">
    <template #body>
      <div class="space-y-2">
        <p class="text-[12.5px]">{{ t('inventory.removeItemDesc', { name: props.name }) }}</p>
        <label v-if="available > 1" class="block text-[11px] text-[var(--sz-text-muted)]">
          {{ t('inventory.removeQty') }}
          <UInputNumber v-model="amount" :min="1" :max="available" class="mt-0.5 w-full" />
          <span class="mt-0.5 block text-[10.5px] text-[var(--sz-text-dim)]">
            {{ t('inventory.removeQtyHint', { qty: available }) }}
          </span>
        </label>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          v-if="available > 1"
          class="mr-auto"
          color="error"
          variant="outline"
          :loading="props.loading"
          :label="t('inventory.removeAll', { qty: available })"
          @click="emit('confirm', available)"
        />
        <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="open = false" />
        <UButton
          color="error"
          :loading="props.loading"
          :label="t('common.delete')"
          @click="emit('confirm', chosen)"
        />
      </div>
    </template>
  </UModal>
</template>
