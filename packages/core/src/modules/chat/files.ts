import { createHash } from 'node:crypto';
import { inspectChatFile } from '@profile/shared/contracts';
import { WriteError } from '../../platform/journal/index.js';

export interface ChatAttachmentFile {
  name: string;
  mimeType: string;
  data: Buffer;
}

export interface ChatAttachmentPrepared extends ChatAttachmentFile {
  /** Hex SHA-256 of the stored bytes; the attachment route uses it as a strong ETag. */
  sha256: string;
}

/** A display name, never a path: one basename, no control characters, bounded length. */
function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = [...base].filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
  return cleaned.join('').trim().slice(0, 200) || 'file';
}

/**
 * The one gate every stored attachment passes: type and bytes are verified, the media type is
 * canonicalized from the bytes (not the browser label) and the hash is recorded. Throws the
 * same `WriteError` the API turns into a 422 envelope.
 */
export function prepareChatAttachment(file: ChatAttachmentFile): ChatAttachmentPrepared {
  const name = safeName(file.name);
  const inspected = inspectChatFile(name, file.mimeType, file.data);
  if ('problem' in inspected) {
    const code =
      inspected.problem === 'unsupported'
        ? 'UNSUPPORTED_FILE_TYPE'
        : inspected.problem === 'not-text'
          ? 'FILE_NOT_TEXT'
          : 'FILE_TYPE_MISMATCH';
    throw new WriteError(422, code, `Attachment "${name}" is not a supported file`);
  }
  return {
    name,
    mimeType: inspected.mimeType,
    data: file.data,
    sha256: createHash('sha256').update(file.data).digest('hex'),
  };
}
