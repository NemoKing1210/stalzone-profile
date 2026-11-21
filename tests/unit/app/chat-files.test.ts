import { describe, expect, it } from 'vitest';
import { CHAT_ATTACHMENT_LIMITS, type ChatAttachmentInput } from '@profile/shared/contracts';
import { addChatFiles } from '~/features/chat/model/files';

function textFile(name: string, content: string | Uint8Array, type = ''): File {
  return new File([content], name, { type });
}

describe('chat composer files', () => {
  it('reads a text file into base64 and keeps its name', async () => {
    const result = await addChatFiles([], [textFile('notes.md', '# Notes')]);

    expect(result.problems).toEqual([]);
    expect(result.files).toEqual([
      { name: 'notes.md', mimeType: 'text/plain', data: Buffer.from('# Notes').toString('base64') },
    ]);
  });

  it('keeps the browser media type for an image', async () => {
    const result = await addChatFiles([], [textFile('shot.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')]);

    expect(result.problems).toEqual([]);
    expect(result.files[0]).toMatchObject({ name: 'shot.png', mimeType: 'image/png' });
  });

  it('refuses an unsupported type without reading it into the turn', async () => {
    const result = await addChatFiles([], [textFile('archive.zip', 'PK', 'application/zip')]);

    expect(result.files).toEqual([]);
    expect(result.problems).toEqual([{ name: 'archive.zip', code: 'unsupported' }]);
  });

  it('refuses a file above the per-file budget', async () => {
    const huge = new Uint8Array(CHAT_ATTACHMENT_LIMITS.fileBytes + 1);
    const result = await addChatFiles([], [textFile('big.txt', huge)]);

    expect(result.files).toEqual([]);
    expect(result.problems).toEqual([{ name: 'big.txt', code: 'too-large' }]);
  });

  it('stops at the file count and the aggregate budget', async () => {
    const existing: ChatAttachmentInput[] = Array.from({ length: CHAT_ATTACHMENT_LIMITS.files }, (_, index) => ({
      name: `note-${index}.txt`,
      mimeType: 'text/plain',
      data: Buffer.from('x').toString('base64'),
    }));
    const overCount = await addChatFiles(existing, [textFile('extra.txt', 'x')]);
    expect(overCount.problems).toEqual([{ name: 'extra.txt', code: 'too-many' }]);

    const three = new Uint8Array(3 * 1024 * 1024);
    const slightlyMore = new Uint8Array(3 * 1024 * 1024 + 1);
    const overTotal = await addChatFiles(
      [{ name: 'one.txt', mimeType: 'text/plain', data: Buffer.from(three).toString('base64') }],
      [textFile('two.txt', slightlyMore)],
    );
    expect(overTotal.files).toHaveLength(1);
    expect(overTotal.problems).toEqual([{ name: 'two.txt', code: 'total-too-large' }]);
  });
});
