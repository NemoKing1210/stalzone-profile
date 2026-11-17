import { describe, expect, it } from 'vitest';
import {
  CharacterCreateSchema,
  CleanupScopeSchema,
  OwnedCreateSchema,
  SyncSourceSchema,
} from '@dossier/shared/contracts';

describe('write contracts', () => {
  it('accepts a character create with a live region', () => {
    expect(CharacterCreateSchema.parse({ nick: 'Tester', region: 'ru', dryRun: false }).nick).toBe('Tester');
  });
  it('rejects an empty nick and the global region', () => {
    expect(CharacterCreateSchema.safeParse({ nick: '', region: 'ru' }).success).toBe(false);
    expect(CharacterCreateSchema.safeParse({ nick: 'T', region: 'global' }).success).toBe(false);
  });
  it('accepts owned kinds and cleanup scopes', () => {
    expect(OwnedCreateSchema.safeParse({ name: 'AK', kind: 'weapon', level: 15 }).success).toBe(true);
    expect(CleanupScopeSchema.parse('all')).toBe('all');
  });
  it('includes icons and profile as sync sources', () => {
    expect(SyncSourceSchema.parse('icons')).toBe('icons');
    expect(SyncSourceSchema.parse('profile')).toBe('profile');
  });
});
