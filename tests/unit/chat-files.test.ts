import { describe, expect, it } from 'vitest';
import {
  CHAT_ATTACHMENT_LIMITS,
  ChatMessageSchema,
  ChatSendSchema,
  chatBase64Bytes,
  chatFileKind,
  inspectChatFile,
  sniffImageMime,
} from '@profile/shared/contracts';

function base64(bytes: number): string {
  return Buffer.alloc(bytes).toString('base64');
}

const image = { name: 'screenshot.png', mimeType: 'image/png', data: base64(1024) };
const notes = { name: 'notes.md', mimeType: '', data: Buffer.from('# Notes\nhello').toString('base64') };

describe('chat attachment contract', () => {
  it('classifies images by their media type and text files by media type or extension', () => {
    expect(chatFileKind('shot.png', 'image/png')).toBe('image');
    expect(chatFileKind('shot.JPG', 'image/jpeg')).toBe('image');
    expect(chatFileKind('notes.md', '')).toBe('text');
    expect(chatFileKind('config.yaml', 'application/octet-stream')).toBe('text');
    expect(chatFileKind('log.txt', 'text/plain; charset=utf-8')).toBe('text');
    expect(chatFileKind('dropped.png', '')).toBe('image');
  });

  it('trusts magic bytes over the declared image type', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);

    expect(sniffImageMime(png)).toBe('image/png');
    expect(sniffImageMime(jpeg)).toBe('image/jpeg');
    expect(inspectChatFile('shot.png', 'image/png', png)).toEqual({ kind: 'image', mimeType: 'image/png' });
    expect(inspectChatFile('shot.jpg', '', jpeg)).toEqual({ kind: 'image', mimeType: 'image/jpeg' });
    expect(inspectChatFile('shot.png', 'image/png', jpeg)).toEqual({ problem: 'type-mismatch' });
    expect(inspectChatFile('shot.png', 'image/png', Uint8Array.from([1, 2, 3]))).toEqual({
      problem: 'type-mismatch',
    });
  });

  it('accepts only UTF-8 text and canonicalizes its media type', () => {
    expect(inspectChatFile('page.html', 'text/html', new TextEncoder().encode('<p>hi</p>'))).toEqual({
      kind: 'text',
      mimeType: 'text/plain; charset=utf-8',
    });
    expect(inspectChatFile('note.txt', 'text/plain', Uint8Array.from([0xff, 0xfe]))).toEqual({ problem: 'not-text' });
    expect(inspectChatFile('note.txt', 'text/plain', Uint8Array.from([0x61, 0x00, 0x62]))).toEqual({
      problem: 'not-text',
    });
  });

  it('refuses a binary type it cannot send to the model', () => {
    expect(chatFileKind('archive.zip', 'application/zip')).toBeNull();
    expect(chatFileKind('model.bin', '')).toBeNull();
  });

  it('counts decoded bytes from base64, including padding', () => {
    expect(chatBase64Bytes(Buffer.from('hello').toString('base64'))).toBe(5);
    expect(chatBase64Bytes(Buffer.from('hi!').toString('base64'))).toBe(3);
    expect(chatBase64Bytes('')).toBe(0);
  });

  it('accepts a turn with files and no text', () => {
    const parsed = ChatSendSchema.safeParse({ message: '', files: [image, notes] });
    expect(parsed.success).toBe(true);
  });

  it('accepts a text-only turn without files', () => {
    expect(ChatSendSchema.safeParse({ message: 'Hello' }).success).toBe(true);
  });

  it('requires either text or a file', () => {
    expect(ChatSendSchema.safeParse({ message: '   ', files: [] }).success).toBe(false);
  });

  it('rejects an unsupported file type', () => {
    const parsed = ChatSendSchema.safeParse({
      message: 'Read this',
      files: [{ name: 'archive.zip', mimeType: 'application/zip', data: base64(10) }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a file above the per-file budget and a total above the aggregate budget', () => {
    const huge = { name: 'big.txt', mimeType: 'text/plain', data: base64(CHAT_ATTACHMENT_LIMITS.fileBytes + 1) };
    expect(ChatSendSchema.safeParse({ message: '', files: [huge] }).success).toBe(false);

    const three = { name: 'three.txt', mimeType: 'text/plain', data: base64(3 * 1024 * 1024) };
    expect(ChatSendSchema.safeParse({ message: '', files: [three, three, three] }).success).toBe(false);
  });

  it('rejects more files than the composer can attach', () => {
    const files = Array.from({ length: CHAT_ATTACHMENT_LIMITS.files + 1 }, (_, index) => ({
      name: `note-${index}.txt`,
      mimeType: 'text/plain',
      data: base64(4),
    }));
    expect(ChatSendSchema.safeParse({ message: '', files }).success).toBe(false);
  });

  it('gives every message an attachment list, empty when it has none', () => {
    const parsed = ChatMessageSchema.parse({
      id: 1,
      threadId: 1,
      role: 'user',
      content: 'Hello',
      toolName: null,
      toolCallId: null,
      payload: null,
      createdAt: '2026-11-21T00:00:00.000Z',
    });
    expect(parsed.attachments).toEqual([]);
  });
});
