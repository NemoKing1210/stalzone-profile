<script setup lang="ts">
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_REF_LIMIT,
  chatBase64Bytes,
  chatFileKind,
  type ChatAttachment,
  type ChatAttachmentInput,
  type ChatPin,
  type ChatSendRef,
  type ItemSummary,
} from '@profile/shared/contracts';
import { storeToRefs } from 'pinia';

import { CHAT_MESSAGE_ENTER_CLASS } from '~/shared/lib/motion';
import { useChatStore } from '~/stores/chat';
import { useItemModalStore } from '~/stores/itemModal';
import { useProfileData } from '~/stores/profile-data';
import { addChatFiles, formatFileSize, type ChatFileIssue } from '../model/files';
import { threadImages } from '../model/gallery';
import {
  catalogCandidate,
  inventoryCandidates,
  mentionQueryAt,
  mergeCandidates,
  pruneMentionRefs,
  rankCandidates,
  replaceMention,
  type ChatItemCandidate,
  type MentionRange,
} from '../model/mentions';
import { chatItemTarget, type ChatItemView } from '../model/render';
import { chatRows, type ChatRow } from '../model/rows';
import ChatAttachmentGallery from './ChatAttachmentGallery.vue';
import ChatFilePreview from './ChatFilePreview.vue';
import ChatItemMenu from './ChatItemMenu.vue';
import ChatLiveTurn from './ChatLiveTurn.vue';
import ChatPinShelf from './ChatPinShelf.vue';
import ChatRowView from './ChatRowView.vue';

/**
 * `standalone` is the `/chat` screen: the composer sits on the page itself, so it drops its
 * divider and keeps a right gutter for the floating radio button.
 */
const props = withDefaults(defineProps<{ standalone?: boolean }>(), { standalone: false });

const chat = useChatStore();
const { messages, pending, sending, queued, streaming, live, loadError } = storeToRefs(chat);
const { t } = useI18n();
const itemModal = useItemModalStore();
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

const prompt = ref<{ textareaRef?: HTMLTextAreaElement | null } | null>(null);
const listId = useId();
const { payload } = useProfileData();
/** The tokens inserted into this draft, with their exact identity for the turn. */
const mentions = ref<ChatSendRef[]>([]);
const menuOpen = ref(false);
const menuRange = ref<MentionRange | null>(null);
const menuActive = ref(0);
const catalogResults = ref<ChatItemCandidate[]>([]);
const catalogLoading = ref(false);
let catalogRequest = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const pinnedCandidates = computed<ChatItemCandidate[]>(() =>
  chat.pins.map((pin) => ({
    token: pin.token,
    kind: pin.kind,
    itemId: pin.itemId,
    instanceId: pin.instanceId,
    name: pin.name,
    rank: pin.rank,
    icon: pin.icon,
    level: pin.level,
    quality: pin.quality,
    virtual: pin.virtual,
    source: 'pinned',
  })),
);
const ownedCandidates = computed(() => inventoryCandidates(payload.value?.inventory ?? null));
const allCandidates = computed(() =>
  mergeCandidates([...pinnedCandidates.value, ...ownedCandidates.value, ...catalogResults.value]),
);
const menuCandidates = computed(() => {
  const range = menuRange.value;
  if (!range) return [];
  const pool = allCandidates.value.filter((candidate) => !range.kind || candidate.kind === range.kind);
  return rankCandidates(range.query, pool).slice(0, 12);
});
const pinnedKeys = computed(
  () => new Set(chat.pins.map((pin) => `${pin.kind}:${pin.itemId}:${pin.instanceId ?? 'catalog'}`)),
);

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

function retryMessage(id: string): void {
  const messageId = Number(id);
  if (Number.isInteger(messageId)) void chat.retry(messageId);
}

/** A tool card opens the global item modal; the conversation stays where it is. */
function openItem(item: ChatItemView): void {
  const target = chatItemTarget(item);
  if (target) itemModal.openTarget(target);
}

async function copyMessage(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ title: t('chat.copied'), color: 'success', icon: 'i-lucide-check' });
  } catch {
    toast.add({ title: t('chat.copyFailed'), color: 'error', icon: 'i-lucide-triangle-alert' });
  }
}

function closeMenu(): void {
  menuOpen.value = false;
  menuRange.value = null;
  catalogResults.value = [];
  catalogLoading.value = false;
  catalogRequest += 1;
  clearTimeout(searchTimer);
}

/** One debounced catalog query for the active `kind:name`; owned items filter locally. */
function searchCatalog(range: MentionRange): void {
  const colon = range.query.indexOf(':');
  const term = range.kind ? range.query.slice(colon + 1) : range.query;
  const q = term.trim();
  clearTimeout(searchTimer);
  if (!q) {
    catalogRequest += 1;
    catalogResults.value = [];
    catalogLoading.value = false;
    return;
  }
  catalogLoading.value = true;
  const request = ++catalogRequest;
  searchTimer = setTimeout(async () => {
    try {
      const rows = await $fetch<ItemSummary[]>('/api/v1/items', {
        query: { q, ...(range.kind ? { kind: range.kind } : {}), limit: 12 },
      });
      if (request !== catalogRequest) return;
      catalogResults.value = rows
        .map((row) => catalogCandidate(row))
        .filter((row): row is ChatItemCandidate => row != null);
    } catch {
      if (request === catalogRequest) catalogResults.value = [];
    } finally {
      if (request === catalogRequest) catalogLoading.value = false;
    }
  }, 200);
}

function updateMenu(): void {
  const textarea = prompt.value?.textareaRef;
  const caret = textarea?.selectionStart ?? draft.value.length;
  const range = mentionQueryAt(draft.value, caret);
  if (!range) {
    closeMenu();
    return;
  }
  menuRange.value = range;
  menuOpen.value = true;
  menuActive.value = Math.min(menuActive.value, Math.max(0, menuCandidates.value.length - 1));
  searchCatalog(range);
}

function focusAt(position: number): void {
  nextTick(() => {
    const textarea = prompt.value?.textareaRef;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(position, position);
  });
}

function selectCandidate(index: number): void {
  const candidate = menuCandidates.value[index];
  const range = menuRange.value;
  if (!candidate || !range) return;
  const live = pruneMentionRefs(draft.value, mentions.value);
  const already = live.some((ref) => ref.token === candidate.token);
  if (!already && live.length >= CHAT_REF_LIMIT) {
    toast.add({
      title: t('chat.mention.limit', { max: CHAT_REF_LIMIT }),
      color: 'warning',
      icon: 'i-lucide-at-sign',
    });
    return;
  }
  const result = replaceMention(draft.value, range, candidate.token);
  draft.value = result.text;
  if (!already) {
    mentions.value = [
      ...mentions.value,
      {
        token: candidate.token,
        kind: candidate.kind,
        itemId: candidate.itemId,
        ...(candidate.instanceId == null ? {} : { instanceId: candidate.instanceId }),
      },
    ];
  }
  closeMenu();
  focusAt(result.caret);
}

/** A pin click is a deliberate action; removing the query keeps the draft clean. */
function toggleMenuPin(index: number): void {
  const candidate = menuCandidates.value[index];
  const range = menuRange.value;
  if (!candidate || !range) return;
  void chat.togglePin({
    kind: candidate.kind,
    itemId: candidate.itemId,
    ...(candidate.instanceId == null ? {} : { instanceId: candidate.instanceId }),
  });
  draft.value = `${draft.value.slice(0, range.start)}${draft.value.slice(range.end)}`;
  closeMenu();
  focusAt(range.start);
}

/** The shelf and the @ button both insert a query at the caret. */
function openMention(): void {
  const textarea = prompt.value?.textareaRef;
  const caret = textarea?.selectionStart ?? draft.value.length;
  const before = draft.value.slice(0, caret);
  const insert = caret > 0 && !/\s/u.test(before.at(-1) ?? '') ? ' @' : '@';
  draft.value = `${before}${insert}${draft.value.slice(caret)}`;
  focusAt(caret + insert.length);
  nextTick(updateMenu);
}

async function removePin(pin: ChatPin): Promise<void> {
  await chat.togglePin({
    kind: pin.kind,
    itemId: pin.itemId,
    ...(pin.instanceId == null ? {} : { instanceId: pin.instanceId }),
  });
}

function hoverCandidate(index: number): void {
  menuActive.value = index;
}

function onKeydown(event: KeyboardEvent): void {
  if (menuOpen.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const count = menuCandidates.value.length;
      if (!count) return;
      const step = event.key === 'ArrowDown' ? 1 : count - 1;
      menuActive.value = (menuActive.value + step) % count;
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (!menuCandidates.value.length) {
        closeMenu();
        return;
      }
      event.preventDefault();
      selectCandidate(menuActive.value);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMenu();
      void nextTick(() => prompt.value?.textareaRef?.focus());
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
      // The caret moves after this handler; re-read it once the browser applied the key.
      void nextTick(updateMenu);
    }
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    void send();
  }
}

watch(draft, () => {
  void nextTick(updateMenu);
});

async function send(): Promise<void> {
  const text = draft.value.trim();
  if ((!text && !files.value.length) || draftTooLong.value) return;
  const outgoing = files.value;
  const refs = pruneMentionRefs(text, mentions.value);
  draft.value = '';
  files.value = [];
  fileError.value = '';
  mentions.value = [];
  closeMenu();
  await chat.send(text, outgoing, refs);
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

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex min-h-full w-full max-w-[52rem] flex-col p-3">
        <div v-if="!messages.length" class="flex flex-1 items-center justify-center p-4">
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
          :spacing-offset="24"
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
                @retry="retryMessage"
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
    </div>

    <div class="mx-auto w-full max-w-[52rem]">
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

      <div :class="props.standalone ? 'p-2 pe-[4.5rem] min-[1500px]:pe-2' : 'border-t border-[var(--sz-border)] p-2'">
        <ChatPinShelf
          :pins="chat.pins"
          :limit="chat.pinLimit"
          :loading="chat.pinsLoading"
          class="mb-2"
          @add="openMention"
          @remove="removePin"
        />
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
        <div class="relative">
          <ChatItemMenu
            v-if="menuOpen"
            :id="listId"
            :candidates="menuCandidates"
            :active-index="menuActive"
            :pinned="pinnedKeys"
            :loading="catalogLoading"
            @select="selectCandidate"
            @pin="toggleMenuPin"
            @hover="hoverCandidate"
          />
          <UChatPrompt
            ref="prompt"
            v-model="draft"
            :placeholder="t('chat.placeholder')"
            :submit-on-enter="false"
            aria-autocomplete="list"
            :aria-controls="menuOpen && menuCandidates.length ? listId : undefined"
            :aria-expanded="menuOpen"
            :aria-activedescendant="menuOpen && menuCandidates.length ? `${listId}-${menuActive}` : undefined"
            @submit="send"
            @keydown="onKeydown"
            @click="updateMenu"
          >
            <template #footer>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-at-sign"
                :aria-label="t('chat.mention.title')"
                :title="t('chat.mention.title')"
                @click="openMention"
              />
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
        </div>
        <input ref="fileInput" type="file" multiple class="hidden" :accept="ACCEPT" @change="onFiles" >
      </div>
    </div>

    <ChatAttachmentGallery v-model:open="galleryOpen" :images="images" :start="galleryStart" />
    <ChatFilePreview v-model:open="previewOpen" :file="previewFile" />
  </div>
</template>
