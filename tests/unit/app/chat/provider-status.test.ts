import { describe, expect, it } from 'vitest';

import { chatProviderState } from '~/features/chat/model/providerStatus';

describe('chatProviderState', () => {
  it('is unknown when the settings read failed', () => {
    expect(chatProviderState(null, { ok: true })).toBe('unknown');
  });

  it('is disabled without a key, before any probe runs', () => {
    expect(chatProviderState({ enabled: false }, null)).toBe('disabled');
    expect(chatProviderState({ enabled: false }, { ok: false })).toBe('disabled');
  });

  it('is checking until the first probe answers', () => {
    expect(chatProviderState({ enabled: true }, null)).toBe('checking');
  });

  it('shows online after a successful probe', () => {
    expect(chatProviderState({ enabled: true }, { ok: true })).toBe('online');
  });

  it('shows error after a failed probe', () => {
    expect(chatProviderState({ enabled: true }, { ok: false })).toBe('error');
  });
});
