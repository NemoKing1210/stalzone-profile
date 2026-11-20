import { chatThreadMessages } from '@profile/mcp';
import { useDb } from '../../../../utils/db';
import { apiError } from '../../../../utils/errors';
import { parseId } from '../../../../utils/write';

export default defineEventHandler((event) => {
  const id = parseId(event);
  if (id === null) return apiError(event, 400, 'VALIDATION', 'id must be a positive integer');
  const read = chatThreadMessages(useDb(), id);
  if (!read) return apiError(event, 404, 'EVENT_NOT_FOUND', 'Thread not found');
  return read;
});
