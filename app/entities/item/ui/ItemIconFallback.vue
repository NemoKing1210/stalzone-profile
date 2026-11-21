<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 32 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
    class="shrink-0 text-[var(--sz-text-dim)]"
    aria-hidden="true"
    focusable="false"
  >
    <!-- An isometric crate: top diamond plus two side faces, drawn with the current text colour. -->
    <path d="M16 4 27 9.5 16 15 5 9.5Z" />
    <path d="M5 9.5 16 15v12L5 21.5Z" />
    <path d="M27 9.5 16 15v12l11-5.5Z" />
    <!-- Three short 135° hatch strokes on the left face, at 55% opacity. -->
    <path d="m8.5 13 3 3" opacity="0.55" />
    <path d="m8.5 17 3 3" opacity="0.55" />
    <path d="m8.5 21 3 3" opacity="0.55" />
  </svg>
</template>
