import { setResponseHeaders } from 'h3';
import { getChatAttachment } from '@profile/core';
import { useDb } from '../../../../utils/db';
import { apiError } from '../../../../utils/errors';
import { parseId } from '../../../../utils/write';

/**
 * Bytes of one attached file. The global session middleware guards the route; the headers
 * keep the browser from sniffing a type and the name out of the URL.
 */
export default defineEventHandler((event) => {
  const id = parseId(event);
  if (id === null) return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');

  const file = getChatAttachment(useDb(), id);
  if (!file) return apiError(event, 404, 'EVENT_NOT_FOUND', 'Attachment not found');

  setResponseHeaders(event, {
    'content-type': file.mimeType || 'application/octet-stream',
    'content-length': file.size,
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, max-age=31536000, immutable',
  });
  return file.data;
});
