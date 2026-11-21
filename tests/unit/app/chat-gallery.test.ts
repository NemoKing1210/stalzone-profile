import { describe, expect, it } from 'vitest';
import { isImageAttachment, threadImages, wrapImageIndex } from '~/features/chat/model/gallery';

function message(id: number, attachments: { id: number; mimeType: string }[]) {
  return {
    id,
    threadId: 1,
    role: 'user' as const,
    content: '',
    toolName: null,
    toolCallId: null,
    payload: null,
    createdAt: '2026-11-21T00:00:00.000Z',
    attachments: attachments.map((file) => ({
      ...file,
      name: `file-${file.id}`,
      size: 1,
      createdAt: '2026-11-21T00:00:00.000Z',
    })),
  };
}

describe('chat gallery model', () => {
  it('collects images from every message in order', () => {
    const images = threadImages([
      message(1, [
        { id: 1, mimeType: 'image/png' },
        { id: 2, mimeType: 'text/plain; charset=utf-8' },
      ]),
      message(2, [{ id: 3, mimeType: 'image/jpeg' }]),
    ]);
    expect(images.map((file) => file.id)).toEqual([1, 3]);
    expect(isImageAttachment({ mimeType: 'image/webp' })).toBe(true);
    expect(isImageAttachment({ mimeType: 'text/plain' })).toBe(false);
  });

  it('wraps at both ends and survives an empty list', () => {
    expect(wrapImageIndex(0, -1, 3)).toBe(2);
    expect(wrapImageIndex(2, 1, 3)).toBe(0);
    expect(wrapImageIndex(1, 0, 3)).toBe(1);
    expect(wrapImageIndex(0, 1, 0)).toBe(0);
  });
});
