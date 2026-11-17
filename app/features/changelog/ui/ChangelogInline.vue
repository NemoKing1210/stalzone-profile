<script setup lang="ts">
import type { InlineToken } from '../model/parse';

defineProps<{ tokens: InlineToken[] }>();
</script>

<template>
  <span class="min-w-0 [overflow-wrap:anywhere]">
    <template v-for="(token, index) in tokens" :key="index">
      <code
        v-if="token.kind === 'code'"
        class="border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-1 py-0.5 font-mono text-[11.5px] text-[var(--sz-text)]"
        >{{ token.text }}</code
      >
      <strong v-else-if="token.kind === 'strong'" class="font-semibold text-[var(--sz-text)]">{{ token.text }}</strong>
      <a
        v-else-if="token.kind === 'link'"
        :href="token.href"
        :target="token.href?.startsWith('http') ? '_blank' : undefined"
        :rel="token.href?.startsWith('http') ? 'noreferrer noopener' : undefined"
        class="text-[var(--sz-accent)] underline decoration-[var(--sz-border-strong)] underline-offset-2 hover:text-[var(--sz-accent-hover)]"
        >{{ token.text }}</a
      >
      <template v-else>{{ token.text }}</template>
    </template>
  </span>
</template>
