import { describe, expect, it } from 'vitest';
import { storageLabel } from '~/features/inventory/model/labels';

const t = (key: string) => `t:${key}`;

describe('storageLabel', () => {
  it('translates built-in storages by kind or default name', () => {
    expect(storageLabel({ kind: 'inventory', name: 'Inventory' }, t)).toBe('t:inventory.title');
    expect(storageLabel({ kind: 'overflow', name: 'Intake' }, t)).toBe('t:inventory.overflow');
    expect(storageLabel({ kind: 'stash', name: 'Stash' }, t)).toBe('t:inventory.stash');
  });

  it('keeps user-authored stash names', () => {
    expect(storageLabel({ kind: 'stash', name: 'Мой склад' }, t)).toBe('Мой склад');
  });
});
