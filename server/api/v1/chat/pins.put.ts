import { CHAT_PIN_LIMIT, ChatPinsUpdateSchema } from '@profile/shared/contracts';
import { replaceChatPins } from '@profile/core';
import { requireOrigin } from '../../../utils/auth';
import { useDb } from '../../../utils/db';
import { validationError } from '../../../utils/errors';
import { readJsonBodyResult } from '../../../utils/read-body';
import { handleWrite } from '../../../utils/write';

/** The shelf is replaced as a whole so a toggle is idempotent across tabs. */
export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const read = await readJsonBodyResult(event);
  if (read.error) return read.error;
  const parsed = ChatPinsUpdateSchema.safeParse(read.body);
  if (!parsed.success) return validationError(event, parsed.error);

  return handleWrite(event, () => ({
    pins: replaceChatPins(useDb(), parsed.data.pins),
    limit: CHAT_PIN_LIMIT,
  }));
});
