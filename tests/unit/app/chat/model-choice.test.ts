import { describe, expect, it } from 'vitest';

import { chatModelItems } from '~/features/chat/model/modelChoice';

describe('chatModelItems', () => {
  it('adds the stored model once when the provider omits it', () => {
    expect(chatModelItems('local-model', [{ id: 'gpt-4.1', label: 'GPT-4.1' }])).toEqual([
      { label: 'local-model', value: 'local-model' },
      { label: 'GPT-4.1', value: 'gpt-4.1' },
    ]);
  });

  it('does not duplicate a model that is already in the list', () => {
    expect(
      chatModelItems('gpt-4.1', [
        { id: 'gpt-4.1', label: 'GPT-4.1' },
        { id: 'gpt-4.1-mini', label: null },
      ]),
    ).toEqual([
      { label: 'GPT-4.1', value: 'gpt-4.1' },
      { label: 'gpt-4.1-mini', value: 'gpt-4.1-mini' },
    ]);
  });

  it('keeps the API order and falls back to the id as the label', () => {
    expect(
      chatModelItems(null, [
        { id: 'z-model', label: 'Zed' },
        { id: 'a-model', label: null },
      ]),
    ).toEqual([
      { label: 'Zed', value: 'z-model' },
      { label: 'a-model', value: 'a-model' },
    ]);
  });

  it('returns an empty list when there is no current model and no provider list', () => {
    expect(chatModelItems('', [])).toEqual([]);
    expect(chatModelItems(null, [])).toEqual([]);
  });
});
