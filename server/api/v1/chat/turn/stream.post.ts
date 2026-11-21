import { ChatSendSchema, type ChatStreamEvent } from '@profile/shared/contracts';
import { runWithEventContext } from '@profile/core';
import { runChatTurnStream } from '@profile/mcp';
import { requireOrigin, requireSession } from '../../../../utils/auth';
import { CHAT_TURN_MAX_BYTES } from '../../../../utils/body';
import { useDb } from '../../../../utils/db';
import { validationError } from '../../../../utils/errors';
import { readJsonBodyResult } from '../../../../utils/read-body';
import { requestEventContext } from '../../../../utils/write';

/**
 * The streamed form of `POST /api/v1/chat/turn`. Same body, same auth and origin rules; the
 * response is one SSE frame per `ChatStreamEvent`, ending with `done` (or `error` when the
 * turn could not start). Aborting the request aborts the provider call and stores nothing of
 * the in-flight answer.
 */
export default defineEventHandler(async (event) => {
  const originError = requireOrigin(event);
  if (originError) return originError;
  const sessionError = requireSession(event);
  if (sessionError) return sessionError;

  const read = await readJsonBodyResult(event, CHAT_TURN_MAX_BYTES);
  if (read.error) return read.error;
  const parsed = ChatSendSchema.safeParse(read.body);
  if (!parsed.success) return validationError(event, parsed.error);

  setResponseHeaders(event, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  const controller = new AbortController();
  // The response closing before we finished means the client went away.
  event.node.res.on('close', () => {
    if (!event.node.res.writableEnded) controller.abort();
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(stream) {
      const send = (payload: ChatStreamEvent): void => {
        stream.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        // The same write/request context `handleWriteAsync` attaches on the non-stream route:
        // assistant writes keep their `origin` and request id in `event_log`, and logs share it.
        await runWithEventContext(requestEventContext(event), () =>
          runChatTurnStream(useDb(), parsed.data, send, { signal: controller.signal }),
        );
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      } finally {
        stream.close();
      }
    },
    cancel() {
      controller.abort();
    },
  });
  // `sendStream` ends the chunked body; returning the stream directly left the socket open.
  return sendStream(event, body);
});
