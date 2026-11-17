import { describe, expect, it } from 'vitest';
import {
  CharacterCreateSchema,
  CharacterPatchSchema,
  CleanupRequestSchema,
  ContainerFillWriteSchema,
  InventoryItemCreateSchema,
  InventoryItemPatchSchema,
  LoginSchema,
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
} from '@profile/shared';

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
  it('normalizes EXBO and profile spellings', () => {
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

describe('inventory write schemas', () => {
  it('fills defaults for a create request', () => {
    const parsed = InventoryItemCreateSchema.parse({ name: 'АК-12' });
    expect(parsed).toMatchObject({ name: 'АК-12', kind: 'weapon', level: 0, qty: 1, dryRun: false });
  });

  it('rejects an out-of-range level and an empty name', () => {
    expect(InventoryItemCreateSchema.safeParse({ name: 'АК-12', level: 16 }).success).toBe(false);
    expect(InventoryItemCreateSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('accepts every inventory kind and rejects a catalog-only motif', () => {
    for (const kind of ['weapon', 'armor', 'container', 'artifact', 'attachment', 'ammo', 'other']) {
      expect(InventoryItemCreateSchema.safeParse({ name: 'АК-12', kind }).success, kind).toBe(true);
    }
    expect(InventoryItemCreateSchema.safeParse({ name: 'АК-12', kind: 'motif' }).success).toBe(false);
  });

  it('requires a real change in a patch', () => {
    expect(InventoryItemPatchSchema.parse({ level: 5 })).toMatchObject({ level: 5 });
    expect(InventoryItemPatchSchema.safeParse({}).success).toBe(false);
    expect(InventoryItemPatchSchema.safeParse({ dryRun: true }).success).toBe(false);
  });

  it('accepts container data on create and patch', () => {
    expect(
      InventoryItemCreateSchema.parse({ name: 'Рюкзак', kind: 'container', container: { slots: 4, eff: 80 } }).container,
    ).toMatchObject({ slots: 4, eff: 80 });
    expect(InventoryItemPatchSchema.parse({ container: { slots: 6 } }).container).toMatchObject({ slots: 6 });
    expect(InventoryItemPatchSchema.parse({ container: null }).container).toBeNull();
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
  it('accepts an empty fill and rejects more than 20 slots', () => {
    expect(ContainerFillWriteSchema.parse({ slots: [] }).slots).toEqual([]);
    const tooMany = Array.from({ length: 21 }, (_, index) => index + 1);
    expect(ContainerFillWriteSchema.safeParse({ slots: tooMany }).success).toBe(false);
  });
});

describe('cleanup request', () => {
  it('defaults to the inventory scope and a dry run', () => {
    expect(CleanupRequestSchema.parse({})).toEqual({ scope: 'inventory', dryRun: false });
    expect(CleanupRequestSchema.parse({ scope: 'journal' })).toEqual({ scope: 'journal', dryRun: false });
    expect(CleanupRequestSchema.parse({ scope: 'all', dryRun: true })).toEqual({ scope: 'all', dryRun: true });
  });

  it('rejects an unknown scope', () => {
    expect(CleanupRequestSchema.safeParse({ scope: 'catalog' }).success).toBe(false);
  });
});

describe('sync source', () => {
  it('accepts the catalog, icon and profile sources and rejects an unknown one', () => {
    for (const source of ['all', 'scpmodel', 'icons', 'profile']) {
      expect(SyncSourceSchema.safeParse(source).success, source).toBe(true);
    }
    expect(SyncSourceSchema.safeParse('seeds').success).toBe(false);
  });
});

describe('character create', () => {
  it('accepts the four live regions and trims the nickname', () => {
    const parsed = CharacterCreateSchema.parse({ nick: '  Tester ', region: 'sea' });
    expect(parsed).toMatchObject({ nick: 'Tester', region: 'sea', dryRun: false });
  });

  it('rejects global, an empty nickname and a 65-character nickname', () => {
    expect(CharacterCreateSchema.safeParse({ nick: 'Tester', region: 'global' }).success).toBe(false);
    expect(CharacterCreateSchema.safeParse({ nick: '   ', region: 'ru' }).success).toBe(false);
    expect(CharacterCreateSchema.safeParse({ nick: 'x'.repeat(65), region: 'ru' }).success).toBe(false);
  });
});

describe('login', () => {
  it('validates non-empty passwords', () => {
    expect(LoginSchema.safeParse({ password: 'secret' }).success).toBe(true);
    expect(LoginSchema.safeParse({ password: '' }).success).toBe(false);
  });
});
