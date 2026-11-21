import { describe, expect, it } from 'vitest';

import { chatItemToken, normalizeChatItemName, parseChatItemTokens } from '@profile/shared/contracts';

describe('chat item references', () => {
  it('normalizes a display name into a token slug', () => {
    expect(normalizeChatItemName(' АК-12 ')).toBe('ак-12');
    expect(normalizeChatItemName('M4A1')).toBe('m4a1');
    expect(normalizeChatItemName('Куница "Спец"')).toBe('куница-спец');
    expect(normalizeChatItemName('---')).toBe('');
  });

  it('builds catalog, instance and collision tokens', () => {
    expect(chatItemToken({ kind: 'weapon', name: 'АК-12', itemId: 12 })).toBe('@weapon:ак-12');
    expect(chatItemToken({ kind: 'weapon', name: 'АК-12', itemId: 12, instanceId: 42 })).toBe(
      '@weapon:ак-12#42',
    );
    expect(chatItemToken({ kind: 'weapon', name: 'АК-12', itemId: 12 }, new Set(['@weapon:ак-12']))).toBe(
      '@weapon:ак-12~12',
    );
  });

  it('parses tokens, their ranges and their identities', () => {
    const text = 'сравни @weapon:ак-12#42 и @armor:куница, потом @weapon:ак-12~12';
    const matches = parseChatItemTokens(text);
    expect(matches.map((match) => [match.token, match.instanceId, match.itemId])).toEqual([
      ['@weapon:ак-12#42', 42, null],
      ['@armor:куница', null, null],
      ['@weapon:ак-12~12', null, 12],
    ]);
    expect(text.slice(matches[0]!.start, matches[0]!.end)).toBe('@weapon:ак-12#42');
  });

  it('does not treat an email as a mention', () => {
    expect(parseChatItemTokens('a@weapon:ак')).toEqual([]);
    expect(parseChatItemTokens('почта: test@weapon:ак-12')).toEqual([]);
  });
});
