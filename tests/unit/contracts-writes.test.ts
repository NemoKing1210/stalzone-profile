import { describe, expect, it } from 'vitest';
import {
  CharacterCreateSchema,
  CreateStorageInputSchema,
  DeleteStorageSchema,
  InventoryItemCreateSchema,
  InventoryItemPatchSchema,
  McpPlacementTargetSchema,
  PlacementTargetSchema,
  StorageCreateSchema,
  SyncSourceSchema,
  WeaponModuleWriteSchema,
} from '@profile/shared/contracts';

describe('write contracts', () => {
  it('accepts a character create with a live region', () => {
    expect(CharacterCreateSchema.parse({ nick: 'Tester', region: 'ru', dryRun: false }).nick).toBe('Tester');
  });
  it('rejects an empty nick and the global region', () => {
    expect(CharacterCreateSchema.safeParse({ nick: '', region: 'ru' }).success).toBe(false);
    expect(CharacterCreateSchema.safeParse({ nick: 'T', region: 'global' }).success).toBe(false);
  });
  it('accepts inventory kinds', () => {
    expect(InventoryItemCreateSchema.safeParse({ name: 'AK', kind: 'weapon', level: 15 }).success).toBe(true);
  });
  it('includes icons and profile as sync sources', () => {
    expect(SyncSourceSchema.parse('icons')).toBe('icons');
    expect(SyncSourceSchema.parse('profile')).toBe('profile');
  });
  it('defaults the site dryRun to false for the inventory writes', () => {
    expect(StorageCreateSchema.parse({ name: 'Stash' }).dryRun).toBe(false);
    expect(StorageCreateSchema.parse({ name: 'Stash', width: 4, height: 4 })).not.toHaveProperty('width');
    expect(InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon' }).dryRun).toBe(false);
  });
  it('defaults the virtual mark off and keeps it optional in a patch', () => {
    expect(InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon' }).virtual).toBe(false);
    expect(InventoryItemCreateSchema.parse({ name: 'АК-12', kind: 'weapon', virtual: true }).virtual).toBe(true);
    expect(InventoryItemPatchSchema.parse({ virtual: true }).virtual).toBe(true);
  });
  it('rejects a rarity outside 0..175', () => {
    expect(() => InventoryItemCreateSchema.parse({ name: 'X', kind: 'artifact', rarityPct: 176 })).toThrow();
  });
  it('accepts a module install, removal and an unverified opt-in', () => {
    expect(WeaponModuleWriteSchema.parse({ attachmentItemId: 3 }).allowUnverified).toBe(false);
    expect(WeaponModuleWriteSchema.parse({ attachmentItemId: null, dryRun: true }).attachmentItemId).toBeNull();
    expect(WeaponModuleWriteSchema.parse({ attachmentItemId: 3, allowUnverified: true }).allowUnverified).toBe(true);
  });
  it('keeps overflow out of the public create contracts', () => {
    expect(StorageCreateSchema.safeParse({ name: 'X', width: 40, height: 80, kind: 'overflow' }).success).toBe(false);
    expect(CreateStorageInputSchema.safeParse({ name: 'X', kind: 'overflow' }).success).toBe(false);
  });
  it('closes the loose write target', () => {
    expect(PlacementTargetSchema.safeParse({ location: 'loose' }).success).toBe(false);
    expect(McpPlacementTargetSchema.safeParse({ location: 'loose' }).success).toBe(false);
    expect('moveToStorageId' in DeleteStorageSchema.parse({})).toBe(false);
  });
});
