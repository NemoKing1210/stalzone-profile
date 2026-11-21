<script setup lang="ts">
const props = defineProps<{ hp: number }>();
const emit = defineEmits<{ 'update:hp': [value: number] }>();

const { t } = useI18n();

const MIN_HP = 1;
const MAX_HP = 100_000;

/** The field is committed on change/blur, so typing a multi-digit value never fights the clamp. */
const text = ref(String(props.hp));
watch(
  () => props.hp,
  (value) => {
    if (Number(text.value) !== value) text.value = String(value);
  },
);

function commit(): void {
  const value = Math.round(Number(text.value));
  if (!Number.isFinite(value)) {
    text.value = String(props.hp);
    return;
  }
  const clamped = Math.min(MAX_HP, Math.max(MIN_HP, value));
  text.value = String(clamped);
  if (clamped !== props.hp) emit('update:hp', clamped);
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <label class="inline-flex items-center gap-1.5 text-[11px] text-[var(--sz-text-muted)]">
      <span class="sz-caps text-[10.5px]">{{ t('weapons.targetHp') }}</span>
      <UInput
        :model-value="text"
        type="number"
        size="xs"
        class="w-24"
        :min="MIN_HP"
        :max="MAX_HP"
        inputmode="numeric"
        @update:model-value="(value) => (text = String(value))"
        @change="commit"
        @blur="commit"
        @keydown.enter="commit"
      />
    </label>
    <span class="text-[10.5px] text-[var(--sz-text-dim)]">{{ t('weapons.targetHpHint') }}</span>
  </div>
</template>
