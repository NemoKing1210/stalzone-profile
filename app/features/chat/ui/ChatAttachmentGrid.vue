<script setup lang="ts">
import type { ChatAttachment } from '@profile/shared/contracts';
import { attachmentUrl, formatFileSize } from '../model/files';
import { isImageAttachment } from '../model/gallery';

const props = defineProps<{ attachments: ChatAttachment[] }>();
const { t } = useI18n();
defineEmits<{ 'open-image': [file: ChatAttachment]; 'open-file': [file: ChatAttachment] }>();

const images = computed(() => props.attachments.filter(isImageAttachment));
const files = computed(() => props.attachments.filter((file) => !isImageAttachment(file)));
</script>

<template>
  <div v-if="images.length" class="mb-1.5 grid gap-1.5" :class="images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'">
    <button
      v-for="file in images"
      :key="file.id"
      type="button"
      class="group relative overflow-hidden border border-[var(--sz-border)] bg-[var(--sz-surface)] text-left"
      :aria-label="file.name"
      @click="$emit('open-image', file)"
    >
      <img
        :src="attachmentUrl(file.id)"
        :alt="file.name"
        loading="lazy"
        class="h-28 w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
      >
      <span class="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
        {{ file.name }}
      </span>
      <span class="absolute right-1 top-1 flex size-5 items-center justify-center bg-black/55 text-white">
        <UIcon name="i-lucide-expand" class="size-3" aria-hidden="true" />
      </span>
    </button>
  </div>

  <div v-if="files.length" class="space-y-1">
    <div
      v-for="file in files"
      :key="file.id"
      class="flex items-stretch border border-[var(--sz-border)] bg-[var(--sz-surface)]"
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[11.5px] text-[var(--sz-text-muted)] hover:text-[var(--sz-text)]"
        @click="$emit('open-file', file)"
      >
        <UIcon name="i-lucide-file-text" class="size-4 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ file.name }}</span>
        <span class="ms-auto shrink-0 tabular-nums text-[var(--sz-text-dim)]">{{ formatFileSize(file.size) }}</span>
      </button>
      <a
        :href="attachmentUrl(file.id, true)"
        :download="file.name"
        :aria-label="t('chat.download')"
        :title="t('chat.download')"
        class="flex w-8 shrink-0 items-center justify-center border-s border-[var(--sz-border)] text-[var(--sz-text-dim)] hover:text-[var(--sz-text)]"
      >
        <UIcon name="i-lucide-download" class="size-3.5" aria-hidden="true" />
      </a>
    </div>
  </div>
</template>
