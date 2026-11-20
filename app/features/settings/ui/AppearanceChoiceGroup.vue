<script setup lang="ts">
interface AppearanceChoice {
  id: string;
  label: string;
  hint?: string;
}

const props = defineProps<{
  label: string;
  name: string;
  modelValue: string;
  options: readonly AppearanceChoice[];
}>();

const emit = defineEmits<{ 'update:modelValue': [id: string] }>();
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="props.label"
    class="grid gap-2"
  >
    <label
      v-for="option in props.options"
      :key="option.id"
      class="flex cursor-pointer items-center gap-2 border px-3 py-2 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sz-accent)]"
      :class="
        props.modelValue === option.id
          ? 'border-[var(--sz-accent)] bg-[var(--sz-surface-alt)] ring-2 ring-[var(--sz-accent)] ring-inset'
          : 'border-[var(--sz-border)] hover:bg-[var(--sz-surface-alt)]'
      "
    >
      <input
        type="radio"
        class="sr-only"
        :name="props.name"
        :value="option.id"
        :checked="props.modelValue === option.id"
        @change="emit('update:modelValue', option.id)"
      >
      <span class="flex-1 text-[12.5px] font-medium">{{ option.label }}</span>
      <span v-if="option.hint" class="text-[11px] text-[var(--sz-text-dim)]">{{ option.hint }}</span>
      <UIcon
        v-if="props.modelValue === option.id"
        name="i-lucide-check"
        class="size-4 text-[var(--sz-accent)]"
        aria-hidden="true"
      />
    </label>
  </div>
</template>
