import type { ChatThread } from '@profile/shared/contracts';
import { useChatStore } from '~/stores/chat';

/** One confirmation flow shared by the `/chat` list and the side panel. */
export function useThreadDelete() {
  const chat = useChatStore();
  const target = ref<ChatThread | null>(null);
  const open = ref(false);
  const busy = ref(false);

  function ask(thread: ChatThread | null | undefined): void {
    if (!thread) return;
    target.value = thread;
    open.value = true;
  }

  async function confirm(): Promise<void> {
    const thread = target.value;
    if (!thread || busy.value) return;
    busy.value = true;
    try {
      if (await chat.deleteThread(thread.id)) open.value = false;
    } finally {
      busy.value = false;
    }
  }

  return { target, open, busy, ask, confirm };
}
