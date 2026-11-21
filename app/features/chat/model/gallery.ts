import type { ChatAttachment, ChatMessage } from '@profile/shared/contracts';

export function isImageAttachment(file: Pick<ChatAttachment, 'mimeType'>): boolean {
  return file.mimeType.startsWith('image/');
}

/** Every image of the thread, oldest message first; the carousel navigates this list. */
export function threadImages(messages: ChatMessage[]): ChatAttachment[] {
  return messages.flatMap((message) => message.attachments).filter(isImageAttachment);
}

/** Carousel movement wraps at both ends and is safe for an empty list. */
export function wrapImageIndex(index: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return (((index + delta) % total) + total) % total;
}
