import {
  CHAT_ATTACHMENT_LIMITS,
  chatBase64Bytes,
  chatFileKind,
  inspectChatFile,
  type ChatAttachmentInput,
  type ChatFileProblem,
} from '@profile/shared/contracts';

export type ChatFileProblemCode = ChatFileProblem | 'too-large' | 'too-many' | 'total-too-large' | 'read-failed';

export interface ChatFileIssue {
  name: string;
  code: ChatFileProblemCode;
}

/** Browser base64 without spreading a multi-megabyte array into one call. */
function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

/**
 * Adds the picked files to the composer list, reading and validating each one. A rejected
 * file never enters the turn; the caller localizes the problem codes.
 */
export async function addChatFiles(
  existing: ChatAttachmentInput[],
  incoming: File[],
): Promise<{ files: ChatAttachmentInput[]; problems: ChatFileIssue[] }> {
  const files = [...existing];
  const problems: ChatFileIssue[] = [];
  let total = existing.reduce((sum, file) => sum + chatBase64Bytes(file.data), 0);

  for (const file of incoming) {
    if (files.length >= CHAT_ATTACHMENT_LIMITS.files) {
      problems.push({ name: file.name, code: 'too-many' });
      continue;
    }
    const kind = chatFileKind(file.name, file.type);
    if (!kind) {
      problems.push({ name: file.name, code: 'unsupported' });
      continue;
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      problems.push({ name: file.name, code: 'read-failed' });
      continue;
    }
    if (bytes.byteLength > CHAT_ATTACHMENT_LIMITS.fileBytes) {
      problems.push({ name: file.name, code: 'too-large' });
      continue;
    }
    if (total + bytes.byteLength > CHAT_ATTACHMENT_LIMITS.totalBytes) {
      problems.push({ name: file.name, code: 'total-too-large' });
      continue;
    }

    // The bytes, not the browser label, decide the stored type; the server repeats the check.
    const inspected = inspectChatFile(file.name, file.type, bytes);
    if ('problem' in inspected) {
      problems.push({ name: file.name, code: inspected.problem });
      continue;
    }

    files.push({
      name: file.name,
      mimeType: inspected.mimeType,
      data: base64FromBytes(bytes),
    });
    total += bytes.byteLength;
  }

  return { files, problems };
}

/** Short human size for a composer chip and a message row. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MiB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KiB`;
  return `${bytes} B`;
}

/** One attachment URL; `download` asks the route for an attachment disposition. */
export function attachmentUrl(id: number, download = false): string {
  return `/api/v1/chat/attachments/${id}${download ? '?download=1' : ''}`;
}

/** The text viewer keeps the response bounded even for a large notes file. */
export const CHAT_TEXT_PREVIEW_CHARS = 200_000;

export function clampTextPreview(raw: string): { text: string; truncated: boolean } {
  return raw.length > CHAT_TEXT_PREVIEW_CHARS
    ? { text: raw.slice(0, CHAT_TEXT_PREVIEW_CHARS), truncated: true }
    : { text: raw, truncated: false };
}
