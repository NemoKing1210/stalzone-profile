import type { ChatTurnResult } from '@profile/shared/contracts';
import { describe, expect, it } from 'vitest';

import { turnOutcome } from '~/features/chat/model/turnOutcome';
import { chatHttpStatus } from '~/shared/lib/chatTurnOutcome';

function result(overrides: Partial<ChatTurnResult> = {}): ChatTurnResult {
  return {
    thread: { id: 1, title: 'Thread', createdAt: '2026-11-21T00:00:00.000Z', updatedAt: '2026-11-21T00:00:00.000Z' },
    messages: [],
    pending: null,
    error: null,
    ...overrides,
  };
}

describe('turnOutcome', () => {
  it('applies silently for the active thread while /chat stays open', () => {
    expect(turnOutcome(result(), 1, '/chat')).toEqual({ apply: true, toast: null });
  });

  it('toasts a reply when the owner left /chat', () => {
    expect(turnOutcome(result(), 1, '/inventory')).toEqual({ apply: true, toast: 'reply' });
  });

  it('leaves another active thread untouched and toasts its reply', () => {
    expect(turnOutcome(result({ thread: { ...result().thread, id: 2 } }), 1, '/chat')).toEqual({
      apply: false,
      toast: 'reply',
    });
  });

  it('prefers a pending confirmation over an error and a reply', () => {
    const pending = { toolName: 'add_inventory_item', args: {}, human: 'Add one', diff: null };
    expect(turnOutcome(result({ pending, error: 'boom' }), 1, '/inventory')).toEqual({
      apply: true,
      toast: 'pending',
    });
  });

  it('toasts a returned error or falls back to the error state', () => {
    expect(turnOutcome(result({ error: 'AI_NOT_CONFIGURED' }), 1, '/inventory')).toEqual({
      apply: true,
      toast: 'error',
    });
  });

  it('adopts a brand-new thread even before it has an id', () => {
    expect(turnOutcome(result({ thread: { ...result().thread, id: 9 } }), null, '/chat')).toEqual({
      apply: true,
      toast: null,
    });
  });
});

describe('chatHttpStatus', () => {
  it('extracts the status from a provider failure and ignores other messages', () => {
    expect(chatHttpStatus('AI_HTTP_400')).toBe('400');
    expect(chatHttpStatus('AI_HTTP_401')).toBe('401');
    expect(chatHttpStatus('AI_NOT_CONFIGURED: set NUXT_AI_OPENAI_API_KEY')).toBeNull();
    expect(chatHttpStatus('AI_HTTP_abc')).toBeNull();
    expect(chatHttpStatus('boom')).toBeNull();
  });
});
