<script setup lang="ts">
import type { ChatAttachment } from '@profile/shared/contracts';
import { attachmentUrl } from '../model/files';
import { wrapImageIndex } from '../model/gallery';

const props = defineProps<{ images: ChatAttachment[]; start: number }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const index = ref(0);
const scale = ref(1);

const current = computed(() => props.images[index.value] ?? null);

function clampStart(value: number): number {
  return Math.min(Math.max(value, 0), Math.max(0, props.images.length - 1));
}

watch(
  open,
  (value) => {
    if (!value) return;
    index.value = clampStart(props.start);
    scale.value = 1;
  },
  { immediate: true },
);

watch(
  () => props.start,
  (value) => {
    if (open.value) index.value = clampStart(value);
  },
);

watch(
  () => props.images.length,
  (length) => {
    if (index.value > length - 1) index.value = Math.max(0, length - 1);
  },
);

function step(delta: number): void {
  index.value = wrapImageIndex(index.value, delta, props.images.length);
  scale.value = 1;
}

function zoom(delta: number): void {
  scale.value = Math.min(3, Math.max(1, scale.value + delta));
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    step(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    step(1);
  } else if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoom(0.25);
  } else if (event.key === '-') {
    event.preventDefault();
    zoom(-0.25);
  } else if (event.key === '0') {
    event.preventDefault();
    scale.value = 1;
  }
}

watch(open, (value) => {
  if (!import.meta.client) return;
  if (value) window.addEventListener('keydown', onKey);
  else window.removeEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    :title="t('chat.galleryTitle')"
    :ui="{ content: '!bg-black !p-0', overlay: 'bg-black/90' }"
  >
    <template #content>
      <div class="flex h-dvh flex-col bg-black text-white">
        <header class="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          <UIcon name="i-lucide-images" class="size-4 shrink-0 text-white/70" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px]">{{ current?.name }}</p>
            <p class="text-[10.5px] tabular-nums text-white/60">{{ index + 1 }} / {{ images.length }}</p>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-zoom-out"
            :aria-label="t('chat.zoomOut')"
            :disabled="scale <= 1"
            @click="zoom(-0.25)"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-zoom-in"
            :aria-label="t('chat.zoomIn')"
            :disabled="scale >= 3"
            @click="zoom(0.25)"
          />
          <UButton
            v-if="current"
            :to="attachmentUrl(current.id, true)"
            download
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-download"
            :aria-label="t('chat.download')"
          />
          <UButton
            v-if="current"
            :to="attachmentUrl(current.id)"
            target="_blank"
            rel="noopener"
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-external-link"
            :aria-label="t('chat.openOriginal')"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-x"
            :aria-label="t('common.close')"
            @click="open = false"
          />
        </header>

        <div class="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
          <button
            v-if="images.length > 1"
            type="button"
            class="absolute left-2 z-10 flex size-11 items-center justify-center bg-black/50 text-white hover:bg-black/75"
            :aria-label="t('chat.previousImage')"
            @click="step(-1)"
          >
            <UIcon name="i-lucide-chevron-left" class="size-6" aria-hidden="true" />
          </button>
          <img
            v-if="current"
            :src="attachmentUrl(current.id)"
            :alt="current.name"
            :style="scale > 1 ? { width: `${scale * 100}%`, maxWidth: 'none', maxHeight: 'none' } : undefined"
            :class="scale === 1 ? 'max-h-full max-w-full object-contain' : 'block'"
          >
          <button
            v-if="images.length > 1"
            type="button"
            class="absolute right-2 z-10 flex size-11 items-center justify-center bg-black/50 text-white hover:bg-black/75"
            :aria-label="t('chat.nextImage')"
            @click="step(1)"
          >
            <UIcon name="i-lucide-chevron-right" class="size-6" aria-hidden="true" />
          </button>
        </div>

        <div v-if="images.length > 1" class="flex gap-2 overflow-x-auto border-t border-white/10 p-2">
          <button
            v-for="(image, position) in images"
            :key="image.id"
            type="button"
            class="relative h-14 w-20 shrink-0 overflow-hidden border transition-opacity"
            :class="position === index ? 'border-white' : 'border-white/20 opacity-60 hover:opacity-100'"
            :aria-label="image.name"
            :aria-current="position === index ? 'true' : undefined"
            @click="index = position; scale = 1"
          >
            <img :src="attachmentUrl(image.id)" :alt="image.name" class="h-full w-full object-cover">
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
