import type { WriteResult } from '@profile/shared/contracts';
import type { Db } from '../../../platform/db/index.js';
import { logEvent, withTransaction, WriteError } from '../../../platform/journal/index.js';
import { deleteChatThread, getChatThread } from '../repo/threads.js';

/**
 * Deletes one thread and, by cascade, its messages and attachment blobs. The audit entry keeps
 * only counts and the id: the title, message text and file bytes are user data, never journal
 * content, and the deletion is not rollbackable.
 */
export function deleteChatThreadWrite(db: Db, threadId: number, dryRun = false): WriteResult {
  const thread = getChatThread(db, threadId);
  if (!thread) throw new WriteError(404, 'THREAD_NOT_FOUND', 'Thread not found');

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM chat_message WHERE thread_id = ?) AS messages,
         (SELECT COUNT(*) FROM chat_attachment a JOIN chat_message m ON m.id = a.message_id WHERE m.thread_id = ?) AS attachments`,
    )
    .get(threadId, threadId) as { messages: number; attachments: number };
  const before = { id: thread.id, messages: counts.messages, attachments: counts.attachments };
  const diff = {
    before,
    after: null,
    human: `Delete thread #${thread.id} (${counts.messages} messages, ${counts.attachments} files)`,
  };
  if (dryRun) return { dryRun: true, diff };

  let eventId: number | undefined;
  withTransaction(db, () => {
    eventId = logEvent(db, {
      actor: 'owner',
      action: 'chat.thread.delete',
      entity: 'chat',
      entityId: thread.id,
      before,
      after: null,
    });
    deleteChatThread(db, thread.id);
  });
  return { dryRun: false, diff, eventId };
}
