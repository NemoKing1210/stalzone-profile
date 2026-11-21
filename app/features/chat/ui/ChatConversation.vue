<script setup lang="ts">
import {
  CHAT_ATTACHMENT_LIMITS,
  chatBase64Bytes,
  chatFileKind,
  type ChatAttachment,
  type ChatAttachmentInput,
} from '@profile/shared/contracts';
import { storeToRefs } from 'pinia';

import { useChatStore } from '~/stores/chat';
import { CHAT_MESSAGE_ENTER_CLASS } from '~/shared/lib/motion';
import { addChatFiles, formatFileSize, type ChatFileIssue } from '../model/files';
import { threadImages } from '../model/gallery';
import { chatItemLink, type ChatItemView } from '../model/render';
import { chatRows, type ChatRow } from '../model/rows';
import ChatAttachmentGallery from './ChatAttachmentGallery.vue';
import ChatFilePreview from './ChatFilePreview.vue';
import ChatLiveTurn from './ChatLiveTurn.vue';
import ChatRowView from './ChatRowView.vue';

const chat = useChatStore();
const { messages, pending, sending, queued, streaming, live, loadError } = storeToRefs(chat);
const { t } = useI18n();
const router = useRouter();
const toast = useToast();
const draft = ref('');
const files = ref<ChatAttachmentInput[]>([]);
const fileError = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const root = ref<HTMLElement | null>(null);
const galleryOpen = ref(false);
const galleryStart = ref(0);
const previewOpen = ref(false);
const previewFile = ref<ChatAttachment | null>(null);
const dragging = ref(false);
let dragDepth = 0;

/** Three real first questions; they send the localized text as a normal message. */
const SUGGESTIONS = ['chat.suggestions.inventory', 'chat.suggestions.prices', 'chat.suggestions.loadout'] as const;
const MESSAGE_LIMIT = 8_000;
const draftTooLong = computed(() => draft.value.length > MESSAGE_LIMIT);

const ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/*',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.yaml',
  '.yml',
  '.xml',
  '.log',
  '.txt',
  '.ts',
  '.js',
  '.sql',
].join(',');

const rows = computed(() => chatRows(messages.value));
const rowsById = computed(() => new Map(rows.value.map((row) => [row.id, row])));
/** A turn the owner navigated away from keeps running in the store, but not on this screen. */
const liveHere = computed(() =>
  live.value && (live.value.threadId == null || live.value.threadId === chat.activeThreadId) ? live.value : null,
);
const uiMessages = computed(() => {
  const list = rows.value.map((row) => ({
    id: row.id,
    role: row.kind === 'user' ? 'user' : 'assistant',
    parts: [{ type: 'text', text: '' }],
    metadata: { rowId: row.id, live: false },
    // A user bubble needs a definite width, otherwise Nuxt UI's shrink-to-fit flex item
    // collapses to the widest character and the bubble becomes a vertical strip.
    ...(row.kind === 'user'
      ? { ui: { container: 'w-full max-w-[75%] ms-auto', body: 'w-full min-w-0', content: 'w-full' } }
      : {}),
  }));
  if (liveHere.value)
    list.push({
      id: 'live',
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
      metadata: { rowId: '', live: true },
    });
  return list;
});

/** UChatMessages passes its own message back; the row id is the only thing we need from it. */
function rowOf(message: unknown): ChatRow | null {
  if (isLive(message)) return null;
  if (!message || typeof message !== 'object' || !('metadata' in message)) return null;
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== 'object' || !('rowId' in metadata)) return null;
  return typeof metadata.rowId === 'string' ? (rowsById.value.get(metadata.rowId) ?? null) : null;
}

function isLive(message: unknown): boolean {
  if (!message || typeof message !== 'object' || !('metadata' in message)) return false;
  const metadata = message.metadata;
  return Boolean(metadata && typeof metadata === 'object' && 'live' in metadata && metadata.live === true);
}

/** Rows appended while a turn streams enter once; opening a stored thread stays still. */
const entered = new Set<string>();
function enterClass(key: string): string {
  if (!streaming.value || !key || entered.has(key)) return '';
  entered.add(key);
  return CHAT_MESSAGE_ENTER_CLASS;
}

function rowKey(message: unknown): string {
  if (isLive(message)) return 'live';
  return rowOf(message)?.id ?? '';
}

const images = computed(() => threadImages(messages.value));
const totalBytes = computed(() => files.value.reduce((sum, file) => sum + chatBase64Bytes(file.data), 0));
const totalPercent = computed(() =>
  Math.min(100, Math.round((totalBytes.value / CHAT_ATTACHMENT_LIMITS.totalBytes) * 100)),
);

function problemText(problem: ChatFileIssue): string {
  switch (problem.code) {
    case 'too-many':
      return t('chat.fileTooMany', { max: CHAT_ATTACHMENT_LIMITS.files });
    case 'too-large':
      return t('chat.fileTooLarge', {
        name: problem.name,
        max: formatFileSize(CHAT_ATTACHMENT_LIMITS.fileBytes),
      });
    case 'total-too-large':
      return t('chat.fileTotalTooLarge', { max: formatFileSize(CHAT_ATTACHMENT_LIMITS.totalBytes) });
    case 'unsupported':
      return t('chat.fileUnsupported', { name: problem.name });
    case 'type-mismatch':
      return t('chat.fileTypeMismatch', { name: problem.name });
    case 'not-text':
      return t('chat.fileNotText', { name: problem.name });
    case 'read-failed':
      return t('chat.fileReadFailed', { name: problem.name });
  }
}

async function addFiles(picked: File[]): Promise<void> {
  if (!picked.length) return;
  const result = await addChatFiles(files.value, picked);
  files.value = result.files;
  fileError.value = result.problems.map(problemText).join(' ');
}

async function onFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const picked = Array.from(input.files ?? []);
  input.value = '';
  await addFiles(picked);
}

function removeFile(index: number): void {
  files.value = files.value.filter((_, current) => current !== index);
  fileError.value = '';
}

function onDragEnter(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return;
  dragDepth += 1;
  dragging.value = true;
}

function onDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragging.value = false;
}

async function onDrop(event: DragEvent): Promise<void> {
  dragDepth = 0;
  dragging.value = false;
  await addFiles(Array.from(event.dataTransfer?.files ?? []));
}

async function onPaste(event: ClipboardEvent): Promise<void> {
  const picked = Array.from(event.clipboardData?.files ?? []);
  if (!picked.length) return;
  event.preventDefault();
  await addFiles(picked);
}

function openImage(file: ChatAttachment): void {
  galleryStart.value = Math.max(
    0,
    images.value.findIndex((image) => image.id === file.id),
  );
  galleryOpen.value = true;
}

function openFile(file: ChatAttachment): void {
  previewFile.value = file;
  previewOpen.value = true;
}

/** A tool card leads to the page that owns the kind, where the instance has its actions. */
function openItem(item: ChatItemView): void {
  const link = chatItemLink(item);
  if (link) void router.push(link);
}

async function copyMessage(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ title: t('chat.copied'), color: 'success', icon: 'i-lucide-check' });
  } catch {
    toast.add({ title: t('chat.copyFailed'), color: 'error', icon: 'i-lucide-triangle-alert' });
  }
}

async function send(): Promise<void> {
  const text = draft.value.trim();
  if ((!text && !files.value.length) || draftTooLong.value) return;
  const outgoing = files.value;
  draft.value = '';
  files.value = [];
  fileError.value = '';
  await chat.send(text, outgoing);
}

/** The panel focuses the composer when it opens; the page does not need to. */
function focus(): void {
  root.value?.querySelector('textarea')?.focus();
}

defineExpose({ focus });
</script>

<template>
  <div
    ref="root"
    class="relative flex min-h-0 flex-1 flex-col"
    @paste="onPaste"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div
      v-if="dragging"
      class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-[var(--sz-accent)] bg-[var(--sz-bg)]/90"
    >
      <p class="flex items-center gap-2 text-[13px] text-[var(--sz-text)]">
        <UIcon name="i-lucide-paperclip" class="size-4" aria-hidden="true" />
        {{ t('chat.dropFiles') }}
      </p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <div v-if="!messages.length" class="flex h-full items-center justify-center p-4">
        <div class="w-full max-w-[46ch] border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] p-3">
          <p class="text-[12.5px] text-[var(--sz-text-muted)]">{{ t('chat.empty') }}</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button
              v-for="suggestion in SUGGESTIONS"
              :key="suggestion"
              type="button"
              class="border border-[var(--sz-border)] px-2 py-1 text-left text-[12px] text-[var(--sz-text)] transition-colors hover:border-[var(--sz-border-strong)] hover:bg-[var(--sz-surface-header)] max-sm:min-h-11"
              @click="chat.send(t(suggestion))"
            >
              {{ t(suggestion) }}
            </button>
          </div>
        </div>
      </div>
      <UChatMessages
        v-else
        :messages="uiMessages as never"
        :auto-scroll="true"
        :status="streaming ? 'streaming' : undefined"
        :compact="true"
        :user="{ side: 'right', variant: 'naked' }"
      >
        <template #content="{ message }">
          <div :class="enterClass(rowKey(message))">
            <ChatLiveTurn v-if="isLive(message)" :live="liveHere" :streaming="streaming" />
            <ChatRowView
              v-else
              :row="rowOf(message)"
              @copy="copyMessage"
              @open-image="openImage"
              @open-file="openFile"
              @open-item="openItem"
            />
          </div>
        </template>
      </UChatMessages>
      <p
        v-if="loadError"
        class="mt-3 border border-[var(--sz-warning)] px-2.5 py-2 text-[12px] text-[var(--sz-warning-text)]"
      >
        {{ loadError }}
      </p>
    </div>

    <div
      v-if="pending"
      class="border-t-2 border-t-[var(--sz-warning)] border-b border-b-[var(--sz-border)] bg-[var(--sz-surface-alt)] p-2.5"
    >
      <div class="flex items-baseline justify-between gap-2">
        <p class="sz-caps text-[var(--sz-warning-text)]">{{ t('chat.pendingTitle') }}</p>
        <span class="truncate font-mono text-[11px] text-[var(--sz-text-dim)]">{{ pending.toolName }}</span>
      </div>
      <p class="mt-1 text-[12.5px]">{{ pending.human }}</p>
      <div class="mt-2 flex justify-end gap-2">
        <UButton size="xs" color="neutral" variant="ghost" :label="t('chat.decline')" @click="chat.declinePending" />
        <UButton size="xs" :label="t('chat.confirm')" :loading="sending" @click="chat.confirmPending" />
      </div>
    </div>

    <div class="border-t border-[var(--sz-border)] p-2">
      <template v-if="files.length">
        <ul class="mb-1.5 flex flex-wrap gap-1.5" :aria-label="t('chat.attachments')">
          <li
            v-for="(file, index) in files"
            :key="`${file.name}-${index}`"
            class="inline-flex max-w-full items-center gap-1.5 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] py-1 pe-1.5 ps-1 text-[11.5px]"
          >
            <img
              v-if="chatFileKind(file.name, file.mimeType) === 'image'"
              :src="`data:${file.mimeType};base64,${file.data}`"
              alt=""
              class="size-7 shrink-0 border border-[var(--sz-border)] object-cover"
            >
            <UIcon
              v-else
              name="i-lucide-file-text"
              class="size-4 shrink-0 text-[var(--sz-text-muted)]"
              aria-hidden="true"
            />
            <span class="min-w-0 truncate">{{ file.name }}</span>
            <span class="shrink-0 tabular-nums text-[var(--sz-text-dim)]">{{
              formatFileSize(chatBase64Bytes(file.data))
            }}</span>
            <button
              type="button"
              class="shrink-0 text-[var(--sz-text-dim)] hover:text-[var(--sz-text)]"
              :aria-label="t('chat.removeFile', { name: file.name })"
              @click="removeFile(index)"
            >
              <UIcon name="i-lucide-x" class="size-3.5" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <div class="mb-1.5">
          <div class="mb-0.5 flex items-baseline justify-between text-[10px] text-[var(--sz-text-dim)]">
            <span>{{ t('chat.filesCount', { count: files.length, max: CHAT_ATTACHMENT_LIMITS.files }) }}</span>
            <span class="tabular-nums">
              {{
                t('chat.filesTotal', {
                  used: formatFileSize(totalBytes),
                  max: formatFileSize(CHAT_ATTACHMENT_LIMITS.totalBytes),
                })
              }}
            </span>
          </div>
          <div class="h-0.5 bg-[var(--sz-border)]">
            <div class="h-full bg-[var(--sz-accent)] transition-[width]" :style="{ width: `${totalPercent}%` }" />
          </div>
        </div>
      </template>
      <p v-if="fileError" class="mb-1.5 text-[11.5px] text-[var(--sz-warning-text)]" aria-live="polite">
        {{ fileError }}
      </p>
      <p
        v-if="draft.length > MESSAGE_LIMIT * 0.9"
        class="mb-1 text-right text-[11px] tabular-nums"
        :class="draftTooLong ? 'text-[var(--sz-danger-text)]' : 'text-[var(--sz-text-dim)]'"
        aria-live="polite"
      >
        {{ t('chat.charCount', { used: draft.length, max: MESSAGE_LIMIT }) }}
      </p>
      <p v-if="queued" class="mb-1 text-[11px] text-[var(--sz-text-dim)]" aria-live="polite">
        {{ t('chat.queued', { count: queued }) }}
      </p>
      <UChatPrompt v-model="draft" :placeholder="t('chat.placeholder')" @submit="send">
        <template #footer>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-paperclip"
            :aria-label="t('chat.attach')"
            :title="t('chat.attach')"
            :disabled="files.length >= CHAT_ATTACHMENT_LIMITS.files"
            @click="fileInput?.click()"
          />
          <UButton
            v-if="sending"
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-square"
            class="ms-auto max-sm:size-11"
            :aria-label="t('chat.stop')"
            :title="t('chat.stop')"
            @click="chat.stop"
          />
          <UChatPromptSubmit
            :class="sending ? 'max-sm:size-11' : 'ms-auto max-sm:size-11'"
            :disabled="(!draft.trim() && !files.length) || draftTooLong"
            :aria-label="t('chat.send')"
          />
        </template>
      </UChatPrompt>
      <input ref="fileInput" type="file" multiple class="hidden" :accept="ACCEPT" @change="onFiles" >
    </div>

    <ChatAttachmentGallery v-model:open="galleryOpen" :images="images" :start="galleryStart" />
    <ChatFilePreview v-model:open="previewOpen" :file="previewFile" />
  </div>
</template>
