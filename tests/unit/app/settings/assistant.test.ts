import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_MODE_KEY,
  assistantBlocks,
  parseAssistantMode,
  readAssistantMode,
  writeAssistantMode,
} from '~/features/settings/model/assistant';

function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    value: (key: string) => data.get(key) ?? null,
  };
}

describe('assistant mode', () => {
  it('defaults to Basic for an absent, empty or unknown value', () => {
    expect(parseAssistantMode(null)).toBe('basic');
    expect(parseAssistantMode(undefined)).toBe('basic');
    expect(parseAssistantMode('')).toBe('basic');
    expect(parseAssistantMode('fancy')).toBe('basic');
    expect(parseAssistantMode('advanced')).toBe('advanced');
  });

  it('reads Basic when storage is unavailable or throws', () => {
    expect(readAssistantMode(null)).toBe('basic');
    expect(
      readAssistantMode({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => undefined,
      }),
    ).toBe('basic');
  });

  it('persists the choice under its own key', () => {
    const store = storage();
    writeAssistantMode('advanced', store);
    expect(store.value(ASSISTANT_MODE_KEY)).toBe('advanced');
    expect(readAssistantMode(store)).toBe('advanced');

    writeAssistantMode('basic', store);
    expect(readAssistantMode(store)).toBe('basic');
  });

  it('renders only Connection in Basic', () => {
    expect(assistantBlocks('basic')).toEqual([{ key: 'connection', open: true }]);
  });

  it('renders all five blocks in Advanced with only Connection open', () => {
    expect(assistantBlocks('advanced')).toEqual([
      { key: 'connection', open: true },
      { key: 'generation', open: false },
      { key: 'reliability', open: false },
      { key: 'dataScope', open: false },
      { key: 'prompts', open: false },
    ]);
  });
});
