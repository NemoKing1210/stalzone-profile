import { describe, expect, it } from 'vitest';

import { emptyLiveTurn, parseSseChunk, reduceLiveTurn, threadToReloadAfterAbort } from '~/shared/lib/chatStream';

describe('chat sse parser', () => {
  it('keeps a partial frame until the next chunk completes it', () => {
    const first = parseSseChunk('data: {"type":"delta","kind":"text","te');
    expect(first.events).toEqual([]);
    expect(first.rest).toContain('"te');

    const second = parseSseChunk(`${first.rest}xt":"Hi"}\n\n`);
    expect(second.events).toEqual([{ type: 'delta', kind: 'text', text: 'Hi' }]);
    expect(second.rest).toBe('');
  });

  it('reads several frames in one chunk and tolerates CRLF', () => {
    const body =
      'data: {"type":"delta","kind":"text","text":"a"}\r\n\r\n' +
      'data: {"type":"delta","kind":"text","text":"b"}\r\n\r\n';
    const parsed = parseSseChunk(body);
    expect(parsed.events.map((event) => (event.type === 'delta' ? event.text : ''))).toEqual(['a', 'b']);
  });

  it('ignores a frame whose type is unknown', () => {
    expect(parseSseChunk('data: {"type":"mystery"}\n\n').events).toEqual([]);
  });
});

describe('chat live reducer', () => {
  it('appends text and reasoning separately', () => {
    let state = emptyLiveTurn();
    state = reduceLiveTurn(state, { type: 'delta', kind: 'reasoning', text: 'think ' });
    state = reduceLiveTurn(state, { type: 'delta', kind: 'text', text: 'Hel' });
    state = reduceLiveTurn(state, { type: 'delta', kind: 'text', text: 'lo' });
    expect(state).toMatchObject({ reasoning: 'think ', text: 'Hello' });
  });

  it('moves a tool call from running to done', () => {
    let state = reduceLiveTurn(emptyLiveTurn(), {
      type: 'tool',
      callId: 'c1',
      name: 'find_items',
      phase: 'start',
    });
    expect(state.tools.c1).toMatchObject({ name: 'find_items', phase: 'running' });

    state = reduceLiveTurn(state, { type: 'tool', callId: 'c1', name: 'find_items', phase: 'done' });
    expect(state.tools.c1?.phase).toBe('done');
  });
});

describe('stop reload', () => {
  it('reloads the streamed thread only while the owner is looking at it', () => {
    expect(threadToReloadAfterAbort(5, 5)).toBe(5);
    expect(threadToReloadAfterAbort(7, 5)).toBeNull();
    expect(threadToReloadAfterAbort(null, 5)).toBeNull();
    expect(threadToReloadAfterAbort(5, null)).toBeNull();
  });
});
