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
import { addChatFiles, formatFileSize, type ChatFileProblem } from '../model/files';
import ChatToolResult from './ChatToolResult.vue';

const chat = useChatStore();
const { messages, pending, sending, loadError } = storeToRefs(chat);
const { t } = useI18n();
const draft = ref('');
const files = ref<ChatAttachmentInput[]>([]);
const fileError = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const root = ref<HTMLElement | null>(null);

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

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: { type: 'text'; text: string }[];
  metadata: { toolName?: string; payload?: unknown; tool?: boolean; attachments: ChatAttachment[] };
}

const uiMessages = computed<UiMessage[]>(() =>
  messages.value.map((message) => ({
    id: String(message.id),
    role: message.role === 'user' ? 'user' : 'assistant',
    parts: [{ type: 'text', text: message.role === 'tool' ? '' : message.content }],
    metadata: {
      tool: message.role === 'tool',
      toolName: message.toolName ?? undefined,
      payload: message.payload,
      attachments: message.attachments,
    },
  })),
);

function problemText(problem: ChatFileProblem): string {
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
    case 'read-failed':
      return t('chat.fileReadFailed', { name: problem.name });
  }
}

async function onFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const picked = Array.from(input.files ?? []);
  input.value = '';
  if (!picked.length) return;
  const result = await addChatFiles(files.value, picked);
  files.value = result.files;
  fileError.value = result.problems.map(problemText).join(' ');
}

function removeFile(index: number): void {
  files.value = files.value.filter((_, current) => current !== index);
  fileError.value = '';
}

function attachmentUrl(id: number): string {
  return `/api/v1/chat/attachments/${id}`;
}

async function send(): Promise<void> {
  const text = draft.value.trim();
  if ((!text && !files.value.length) || sending.value) return;
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
  <div ref="root" class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <div v-if="!messages.length" class="flex h-full items-center justify-center px-6 text-center">
        <p class="max-w-[34ch] text-[12.5px] text-[var(--sz-text-dim)]">{{ t('chat.empty') }}</p>
      </div>
      <UChatMessages v-else :messages="uiMessages as never" :auto-scroll="true">
        <template #content="{ message }">
          <ChatToolResult
            v-if="(message as unknown as UiMessage).metadata.tool"
            :tool-name="(message as unknown as UiMessage).metadata.toolName ?? 'tool'"
            :payload="(message as unknown as UiMessage).metadata.payload"
          />
          <template v-else>
            <ul
              v-if="(message as unknown as UiMessage).metadata.attachments.length"
              class="mb-1.5 flex flex-wrap gap-1.5"
            >
              <li
                v-for="file in (message as unknown as UiMessage).metadata.attachments"
                :key="file.id"
                class="max-w-full"
              >
                <a
                  v-if="file.mimeType.startsWith('image/')"
                  :href="attachmentUrl(file.id)"
                  target="_blank"
                  rel="noopener"
                  class="block border border-[var(--sz-border)]"
                >
                  <img
                    :src="attachmentUrl(file.id)"
                    :alt="file.name"
                    loading="lazy"
                    class="max-h-48 max-w-full object-contain"
                  >
                </a>
                <a
                  v-else
                  :href="attachmentUrl(file.id)"
                  :download="file.name"
                  class="inline-flex max-w-full items-center gap-1.5 border border-[var(--sz-border)] bg-[var(--sz-surface)] px-2 py-1 text-[11.5px] text-[var(--sz-text-muted)] hover:text-[var(--sz-text)]"
                >
                  <UIcon name="i-lucide-file-text" class="size-3.5 shrink-0" aria-hidden="true" />
                  <span class="truncate">{{ file.name }}</span>
                  <span class="shrink-0 tabular-nums text-[var(--sz-text-dim)]">{{ formatFileSize(file.size) }}</span>
                </a>
              </li>
            </ul>
            <span v-if="(message as unknown as UiMessage).parts[0]?.text" class="whitespace-pre-wrap">{{
              (message as unknown as UiMessage).parts[0]?.text
            }}</span>
          </template>
        </template>
      </UChatMessages>
      <p v-if="loadError" class="mt-3 border border-[var(--sz-warning)] px-2.5 py-2 text-[12px] text-[var(--sz-warning-text)]">
        {{ loadError }}
      </p>
    </div>

    <div v-if="pending" class="border-t border-[var(--sz-border)] bg-[var(--sz-surface-alt)] p-2.5">
      <div class="flex items-baseline justify-between gap-2">
        <p class="sz-caps text-[var(--sz-text-muted)]">{{ t('chat.pendingTitle') }}</p>
        <span class="truncate text-[11px] text-[var(--sz-text-dim)]">{{ pending.toolName }}</span>
      </div>
      <p class="mt-1 text-[12.5px]">{{ pending.human }}</p>
      <div class="mt-2 flex justify-end gap-2">
        <UButton size="xs" color="neutral" variant="ghost" :label="t('chat.decline')" @click="chat.declinePending" />
        <UButton size="xs" :label="t('chat.confirm')" :loading="sending" @click="chat.confirmPending" />
      </div>
    </div>

    <div class="border-t border-[var(--sz-border)] p-2">
      <ul v-if="files.length" class="mb-1.5 flex flex-wrap gap-1.5" :aria-label="t('chat.attachments')">
        <li
          v-for="(file, index) in files"
          :key="`${file.name}-${index}`"
          class="inline-flex max-w-full items-center gap-1.5 border border-[var(--sz-border)] bg-[var(--sz-surface-alt)] px-2 py-1 text-[11.5px]"
        >
          <UIcon
            :name="chatFileKind(file.name, file.mimeType) === 'image' ? 'i-lucide-image' : 'i-lucide-file-text'"
            class="size-3.5 shrink-0 text-[var(--sz-text-muted)]"
            aria-hidden="true"
          />
          <span class="min-w-0 truncate">{{ file.name }}</span>
          <span class="shrink-0 tabular-nums text-[var(--sz-text-dim)]">{{ formatFileSize(chatBase64Bytes(file.data)) }}</span>
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
      <p v-if="fileError" class="mb-1.5 text-[11.5px] text-[var(--sz-warning-text)]">{{ fileError }}</p>
      <UChatPrompt
        v-model="draft"
        :placeholder="t('chat.placeholder')"
        :loading="sending"
        :disabled="sending"
        @submit="send"
      >
        <template #footer>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-paperclip"
            :aria-label="t('chat.attach')"
            :title="t('chat.attach')"
            :disabled="sending || files.length >= CHAT_ATTACHMENT_LIMITS.files"
            @click="fileInput?.click()"
          />
          <UChatPromptSubmit
            class="ms-auto max-sm:size-11"
            :disabled="(!draft.trim() && !files.length) || sending"
            :loading="sending"
            :aria-label="t('chat.send')"
          />
        </template>
      </UChatPrompt>
      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        :accept="ACCEPT"
        @change="onFiles"
      >
    </div>
  </div>
</template>
