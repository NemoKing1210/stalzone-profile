<script setup lang="ts">
import type { ChatAttachment } from '@profile/shared/contracts';
import { attachmentUrl, clampTextPreview, formatFileSize } from '../model/files';

const props = defineProps<{ file: ChatAttachment | null }>();
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const toast = useToast();
const text = ref('');
const truncated = ref(false);
const loading = ref(false);
const error = ref('');
let controller: AbortController | null = null;

async function load(): Promise<void> {
  const file = props.file;
  if (!file) return;
  controller?.abort();
  const current = new AbortController();
  controller = current;
  loading.value = true;
  error.value = '';
  text.value = '';
  truncated.value = false;
  try {
    const raw = await $fetch<string>(attachmentUrl(file.id), {
      responseType: 'text',
      signal: current.signal,
    });
    const preview = clampTextPreview(raw);
    text.value = preview.text;
    truncated.value = preview.truncated;
  } catch {
    if (!current.signal.aborted) error.value = t('chat.previewFailed');
  } finally {
    if (controller === current) loading.value = false;
  }
}

watch(
  open,
  (value) => {
    if (value) void load();
    else {
      controller?.abort();
      controller = null;
    }
  },
  { immediate: true },
);

watch(
  () => props.file,
  () => {
    if (open.value) void load();
  },
);

onBeforeUnmount(() => controller?.abort());

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(text.value);
    toast.add({ title: t('chat.copied'), color: 'success', icon: 'i-lucide-check' });
  } catch {
    toast.add({ title: t('chat.copyFailed'), color: 'error', icon: 'i-lucide-triangle-alert' });
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="file?.name ?? t('chat.previewTitle')" :ui="{ content: 'sm:max-w-3xl' }">
    <template #actions>
      <UButton
        v-if="text"
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-copy"
        :label="t('chat.copy')"
        @click="copy"
      />
      <UButton
        v-if="file"
        :to="attachmentUrl(file.id, true)"
        download
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-download"
        :label="t('chat.download')"
      />
    </template>

    <template #body>
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2 text-[11.5px] text-[var(--sz-text-muted)]">
          <span class="truncate">{{ file?.name }}</span>
          <span class="shrink-0 tabular-nums">{{ file ? formatFileSize(file.size) : '' }}</span>
        </div>
        <div v-if="loading" class="flex min-h-40 items-center justify-center text-[12px] text-[var(--sz-text-dim)]">
          <UIcon name="i-lucide-loader-circle" class="mr-2 size-4 animate-spin" aria-hidden="true" />
          {{ t('chat.previewLoading') }}
        </div>
        <p v-else-if="error" class="border border-[var(--sz-warning)] px-2.5 py-2 text-[12px] text-[var(--sz-warning-text)]">
          {{ error }}
        </p>
        <template v-else>
          <pre
            class="max-h-[62vh] overflow-auto whitespace-pre-wrap break-words border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] p-2.5 font-mono text-[11.5px] leading-relaxed"
          >{{ text }}</pre>
          <p v-if="truncated" class="text-[11px] text-[var(--sz-text-dim)]">
            {{ t('chat.previewTruncated', { count: text.length }) }}
          </p>
        </template>
      </div>
    </template>
  </UModal>
</template>
