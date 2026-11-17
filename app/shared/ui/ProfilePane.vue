<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title?: string;
    label?: string;
    hint?: string;
    dense?: boolean;
    flush?: boolean;
  }>(),
  { title: undefined, label: undefined, hint: undefined, dense: false, flush: false },
);

const id = useId();
const titleId = `${id}-title`;
const hasHeader = computed(() => Boolean(props.title || props.hint));
</script>

<template>
  <section
    class="flex min-h-0 flex-col border border-[var(--sz-border)] bg-[var(--sz-surface)]"
    :aria-label="label"
    :aria-labelledby="title && !$slots.header ? titleId : undefined"
  >
    <header
      v-if="hasHeader || $slots.header || $slots.actions"
      class="flex min-h-[30px] shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--sz-border)] bg-[var(--sz-surface-header)] px-2.5 py-1"
    >
      <slot name="header">
        <h2 :id="titleId" class="sz-caps truncate text-[var(--sz-text-muted)]" :title="title">{{ title }}</h2>
      </slot>
      <span v-if="hint" class="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--sz-text-muted)]">{{ hint }}</span>
      <div v-if="$slots.actions" data-pane-actions class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
        <slot name="actions" />
      </div>
    </header>

    <div :class="['min-h-0 flex-1', flush ? '' : dense ? 'p-2' : 'p-3']">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="shrink-0 border-t border-[var(--sz-border)] px-2.5 py-1.5">
      <slot name="footer" />
    </footer>
  </section>
</template>
