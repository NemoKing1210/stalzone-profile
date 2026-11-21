import { setResponseHeaders, setResponseStatus } from 'h3';
import { getChatAttachment } from '@profile/core';
import { chatFileKind } from '@profile/shared/contracts';
import { useDb } from '../../../../utils/db';
import { apiError } from '../../../../utils/errors';
import { parseId } from '../../../../utils/write';

/** RFC 5987 filename for `Content-Disposition`; the header never carries a raw path. */
function dispositionName(name: string): string {
  return encodeURIComponent(name).replace(/['()*!]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Bytes of one attached file. The global session middleware guards the route. Images are
 * served with the type sniffed at upload; every text file is served as `text/plain` with an
 * attachment disposition, so an uploaded HTML/JS file can never execute on this origin.
 */
export default defineEventHandler((event) => {
  const id = parseId(event);
  if (id === null) return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');

  const file = getChatAttachment(useDb(), id);
  if (!file) return apiError(event, 404, 'EVENT_NOT_FOUND', 'Attachment not found');

  const etag = `"${file.sha256 || `${file.id}-${file.size}`}"`;
  const download = getRequestURL(event).searchParams.get('download') === '1';
  const image = chatFileKind(file.name, file.mimeType) === 'image';
  const name = dispositionName(file.name);

  if (getRequestHeader(event, 'if-none-match') === etag) {
    setResponseHeaders(event, { etag, 'cache-control': 'private, no-cache' });
    setResponseStatus(event, 304);
    return null;
  }

  setResponseHeaders(event, {
    'content-type': image ? file.mimeType : 'text/plain; charset=utf-8',
    'content-length': file.size,
    'content-disposition': `${image && !download ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
    etag,
    'cache-control': 'private, no-cache',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': "default-src 'none'; sandbox",
  });
  return file.data;
});
