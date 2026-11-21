import { ChatStreamEventSchema, type ChatStreamEvent } from '@profile/shared/contracts';

export type LiveToolPhase = 'running' | 'done' | 'declined';

export interface LiveTool {
  id: string;
  name: string;
  phase: LiveToolPhase;
}

/** What the conversation shows while a turn is still arriving; persisted rows stay untouched. */
export interface LiveTurn {
  threadId: number | null;
  messageId: number | null;
  text: string;
  reasoning: string;
  tools: Record<string, LiveTool>;
}

export function emptyLiveTurn(): LiveTurn {
  return { threadId: null, messageId: null, text: '', reasoning: '', tools: {} };
}

/**
 * Splits an SSE buffer into recognized `ChatStreamEvent`s. A frame is only consumed once its
 * blank line arrived, so a JSON body split across network chunks waits in `rest`; a frame the
 * contract does not know is dropped instead of breaking the stream.
 */
export function parseSseChunk(buffer: string): { events: ChatStreamEvent[]; rest: string } {
  const events: ChatStreamEvent[] = [];
  let rest = buffer.replace(/\r\n/g, '\n');
  let boundary = rest.indexOf('\n\n');
  while (boundary >= 0) {
    const frame = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    for (const line of frame.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      try {
        const parsed = ChatStreamEventSchema.safeParse(JSON.parse(raw));
        if (parsed.success) events.push(parsed.data);
      } catch {
        // A malformed frame is a provider bug, not a reason to kill the conversation.
      }
    }
    boundary = rest.indexOf('\n\n');
  }
  return { events, rest };
}

/** Folds one event into the live turn; terminal `done`/`error` frames are the store's job. */
export function reduceLiveTurn(state: LiveTurn, event: ChatStreamEvent): LiveTurn {
  switch (event.type) {
    case 'meta':
      return { ...state, threadId: event.thread.id, messageId: event.message.id };
    case 'delta':
      return event.kind === 'reasoning'
        ? { ...state, reasoning: state.reasoning + event.text }
        : { ...state, text: state.text + event.text };
    case 'tool':
      return {
        ...state,
        tools: {
          ...state.tools,
          [event.callId]: {
            id: event.callId,
            name: event.name,
            phase: event.phase === 'start' ? 'running' : event.phase,
          },
        },
      };
    default:
      return state;
  }
}

/**
 * After Stop, the database is the truth — but only reload the thread the owner is still
 * looking at. A turn abandoned in thread 5 must not yank the reader out of thread 7.
 */
export function threadToReloadAfterAbort(activeThreadId: number | null, streamingThreadId: number | null): number | null {
  return streamingThreadId != null && activeThreadId === streamingThreadId ? streamingThreadId : null;
}
