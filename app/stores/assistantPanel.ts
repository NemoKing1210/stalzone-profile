import { defineStore } from 'pinia';

/** One panel per SPA; the layout mounts it and the top bar or palette toggles it. */
export const useAssistantPanelStore = defineStore('assistantPanel', () => {
  const open = ref(false);
  /** The control that opened the panel, so Escape and the close button return focus to it. */
  const trigger = ref<HTMLElement | null>(null);

  function show(source: HTMLElement | null = null): void {
    trigger.value = source;
    open.value = true;
  }

  function hide(): void {
    open.value = false;
    if (!import.meta.client) return;
    const target =
      trigger.value ??
      [...document.querySelectorAll<HTMLElement>('button[aria-label="Open assistant panel"]')].find(
        (element) => element.offsetParent !== null,
      ) ??
      null;
    void nextTick(() => target?.focus());
  }

  function toggle(): void {
    open.value = !open.value;
  }

  return { open, show, hide, toggle };
});
