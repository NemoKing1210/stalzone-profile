<script setup lang="ts">
import { useAssistantPanelStore } from '~/stores/assistantPanel';
import { useChatStore } from '~/stores/chat';

const { t } = useI18n();
const route = useRoute();
const assistant = useAssistantPanelStore();
const chat = useChatStore();
const assistantBusy = computed(() => chat.sending || chat.pending != null);
const onChat = computed(() => route.path === '/chat');

function togglePanel(event: MouseEvent): void {
  if (assistant.open) assistant.hide();
  else assistant.show(event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
}
const { theme, toggleTheme } = useTheme();
const themeLabel = computed(() => (theme.value === 'dark' ? t('palette.themeLight') : t('palette.themeDark')));
</script>

<template>
  <div class="flex items-center gap-1">
    <button
      v-if="!onChat"
      type="button"
      class="relative inline-flex size-8 items-center justify-center border border-transparent text-[var(--sz-text-muted)] transition-colors hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sz-accent)]"
      :aria-label="t('chat.panelOpen')"
      :title="t('chat.panelOpen')"
      :aria-expanded="assistant.open"
      aria-controls="assistant-panel"
      data-assistant-toggle
      @click="togglePanel"
    >
      <UIcon name="i-lucide-sparkles" class="size-4" aria-hidden="true" />
      <span
        v-if="assistantBusy"
        class="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--sz-accent)]"
        aria-hidden="true"
      />
    </button>
    <LocaleSwitcher />
    <button
      type="button"
      class="inline-flex size-8 items-center justify-center border border-transparent text-[var(--sz-text-muted)] transition-colors hover:bg-[var(--sz-surface-alt)] hover:text-[var(--sz-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sz-accent)]"
      :aria-label="themeLabel"
      :title="themeLabel"
      @click="toggleTheme"
    >
      <UIcon :name="theme === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>
