import type { ChatModel } from '@profile/shared/contracts';

export interface ChatModelItem {
  label: string;
  value: string;
}

/**
 * Items for the chat header picker: the stored model is always present even when the
 * provider omits it, the API order is preserved, and a missing display name falls back to id.
 */
export function chatModelItems(current: string | null | undefined, models: readonly ChatModel[]): ChatModelItem[] {
  const items = models.map((model) => ({ label: model.label ?? model.id, value: model.id }));
  const id = (current ?? '').trim();
  if (id && !items.some((item) => item.value === id)) items.unshift({ label: id, value: id });
  return items;
}
