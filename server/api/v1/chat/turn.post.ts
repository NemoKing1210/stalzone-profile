import { ChatSendSchema } from '@profile/shared/contracts';
import { runChatTurn } from '@profile/mcp';
import { useDb } from '../../../utils/db';
import { validationError } from '../../../utils/errors';
import { requireOrigin } from '../../../utils/auth';
import { readJsonBodyResult } from '../../../utils/read-body';
import { handleWriteAsync } from '../../../utils/write';

export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;

  const read = await readJsonBodyResult(event);
  if (read.error) return read.error;
  const parsed = ChatSendSchema.safeParse(read.body);
  if (!parsed.success) return validationError(event, parsed.error);

  return handleWriteAsync(event, () => runChatTurn(useDb(), parsed.data));
});
