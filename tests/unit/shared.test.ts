import { describe, expect, it } from 'vitest';
import {
  BuildInputSchema,
  CharacterPatchSchema,
  CleanupRequestSchema,
  ContainerFillSchema,
  LoginSchema,
  OwnedCreateSchema,
  OwnedPatchSchema,
  SyncSourceSchema,
  dec,
  fmtMoney,
  g1,
  g2,
  norm,
  num,
  rankKey,
  round,
  sha1,
  slugify,
} from '@dossier/shared';

describe('norm', () => {
  it('lowercases, drops quotes, folds ё and collapses spaces', () => {
    expect(norm('  «Руна»   (А) Ёлка  ')).toBe('руна (а) елка');
  });

  it('handles null and undefined', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
  });
});

describe('rankKey', () => {
  it('normalizes EXBO and dossier spellings', () => {
    expect(rankKey('RANK_MASTER')).toBe('master');
    expect(rankKey('legendary')).toBe('legend');
    expect(rankKey(' stalker ')).toBe('stalker');
  });

  it('returns null for unknown ranks', () => {
    expect(rankKey('epic')).toBeNull();
    expect(rankKey(null)).toBeNull();
  });
});

describe('fmtMoney', () => {
  it('formats thousands and millions in English by default', () => {
    expect(fmtMoney(999)).toBe('999');
    expect(fmtMoney(1500)).toBe('2K');
    expect(fmtMoney(2_500_000)).toBe('2.50M');
  });

  it('formats thousands and millions in Russian when asked', () => {
    expect(fmtMoney(999, 'ru-RU')).toBe('999');
    expect(fmtMoney(1500, 'ru-RU')).toBe('2 тыс.');
    expect(fmtMoney(2_500_000, 'ru-RU')).toBe('2,50 млн');
  });

  it('returns a dash for missing values', () => {
    expect(fmtMoney(null)).toBe('—');
  });
});

describe('locale-aware decimals', () => {
  it('uses a dot for English and a comma for Russian', () => {
    expect(g1(2.5)).toBe('2.5');
    expect(g1(2.5, 'ru-RU')).toBe('2,5');
    expect(g2(2.5)).toBe('2.50');
    expect(g2(2.5, 'ru-RU')).toBe('2,50');
  });
});

describe('dec', () => {
  it('keeps up to two decimals, trims trailing zeros and follows the locale', () => {
    expect(dec(1.25)).toBe('1.25');
    expect(dec(1.25, 'ru-RU')).toBe('1,25');
    expect(dec(2)).toBe('2');
    expect(dec(2, 'ru-RU')).toBe('2');
    expect(dec(1.239)).toBe('1.24');
  });

  it('returns a dash for missing values', () => {
    expect(dec(null)).toBe('—');
    expect(dec(undefined)).toBe('—');
  });
});

describe('num', () => {
  it('groups digits for the requested locale', () => {
    expect(num(12345)).toBe('12,345');
    expect(num(12345, 'ru-RU')).toBe('12 345');
  });

  it('returns a dash for missing values', () => {
    expect(num(null)).toBe('—');
  });
});

describe('slugify', () => {
  it('transliterates Russian names and strips punctuation', () => {
    expect(slugify('«Руна» (А)')).toBe('runa-a');
  });
});

describe('round', () => {
  it('rounds half up and avoids negative zero', () => {
    expect(round(1.25, 1)).toBe(1.3);
    expect(round(-0.001, 2)).toBe(0);
  });
});

describe('sha1', () => {
  it('matches the known digest', () => {
    expect(sha1('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
});

describe('owned schemas', () => {
  it('fills defaults for a create request', () => {
    const parsed = OwnedCreateSchema.parse({ name: 'АК-12' });
    expect(parsed).toMatchObject({ name: 'АК-12', kind: 'weapon', level: 0, qty: 1, dryRun: false });
  });

  it('rejects an out-of-range level and an empty name', () => {
    expect(OwnedCreateSchema.safeParse({ name: 'АК-12', level: 16 }).success).toBe(false);
    expect(OwnedCreateSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('requires a real change in a patch', () => {
    expect(OwnedPatchSchema.parse({ level: 5 })).toMatchObject({ level: 5 });
    expect(OwnedPatchSchema.safeParse({}).success).toBe(false);
    expect(OwnedPatchSchema.safeParse({ dryRun: true }).success).toBe(false);
  });

  it('accepts a container override on create and patch', () => {
    expect(
      OwnedCreateSchema.parse({ name: 'Рюкзак', kind: 'container', container: { slots: 4, eff: 80 } }).container,
    ).toMatchObject({ slots: 4, eff: 80 });
    expect(OwnedPatchSchema.parse({ container: { slots: 6 } }).container).toMatchObject({ slots: 6 });
    expect(OwnedPatchSchema.parse({ container: null }).container).toBeNull();
  });
});

describe('character patch', () => {
  it('accepts raw stats and rejects derived fields', () => {
    expect(
      CharacterPatchSchema.parse({ stats: { kil: 300, 'reg-tim': '2024-06-01', dea: null } }).stats,
    ).toEqual({ kil: 300, 'reg-tim': '2024-06-01', dea: null });
    expect(CharacterPatchSchema.safeParse({ kd: 9 }).success).toBe(false);
    expect(CharacterPatchSchema.safeParse({ hours: 120 }).success).toBe(false);
    expect(CharacterPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe('container fill', () => {
  it('accepts an empty fill and rejects more than 20 artifacts', () => {
    expect(ContainerFillSchema.parse({ artifacts: [] }).artifacts).toEqual([]);
    const tooMany = Array.from({ length: 21 }, () => ({ name: 'Осколок' }));
    expect(ContainerFillSchema.safeParse({ artifacts: tooMany }).success).toBe(false);
  });
});

describe('build input', () => {
  it('accepts a latin slug and rejects a cyrillic one', () => {
    expect(BuildInputSchema.parse({ slug: 'speed-run', title: 'Скорость' }).rows).toEqual([]);
    expect(BuildInputSchema.safeParse({ slug: 'скорость', title: 'Скорость' }).success).toBe(false);
  });
});

describe('cleanup request', () => {
  it('parses cleanup requests with a default dry run', () => {
    expect(CleanupRequestSchema.parse({ scope: 'owned' })).toEqual({ scope: 'owned', dryRun: false });
    expect(CleanupRequestSchema.safeParse({ scope: 'everything' }).success).toBe(false);
  });
});

describe('sync source', () => {
  it('accepts known sources and rejects the removed profile source', () => {
    expect(SyncSourceSchema.safeParse('all').success).toBe(true);
    expect(SyncSourceSchema.safeParse('scpmodel').success).toBe(true);
    expect(SyncSourceSchema.safeParse('profile').success).toBe(false);
  });
});

describe('login', () => {
  it('validates non-empty passwords', () => {
    expect(LoginSchema.safeParse({ password: 'secret' }).success).toBe(true);
    expect(LoginSchema.safeParse({ password: '' }).success).toBe(false);
  });
});
