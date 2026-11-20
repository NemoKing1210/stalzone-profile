import { describe, expect, it } from 'vitest';
import { acceptsEquipment, equipmentSlotsFor, type EquipmentSlot } from '@profile/shared/contracts';

const rifle = { kind: 'weapon', category: 'weapon/assault_rifle' };
const uncategorizedWeapon = { kind: 'weapon', category: null };
const melee = { kind: 'weapon', category: 'weapon/melee' };
const pistol = { kind: 'weapon', category: 'weapon/pistol' };
const armor = { kind: 'armor', category: 'armor/combat' };
const backpack = { kind: 'container', category: 'containers/backpacks' };
const artifactBag = { kind: 'container', category: 'containers' };
const unknownBag = { kind: 'container', category: 'boxes/crate' };
const artifact = { kind: 'artifact', category: 'artefact/gravity' };
const attachment = { kind: 'attachment', category: 'attachment/scope' };
const ammo = { kind: 'ammo', category: 'ammo/rifle' };
const consumable = { kind: 'other', category: 'consumables/medkit' };

describe('equipment compatibility table', () => {
  it.each<[EquipmentSlot, { kind: string; category: string | null }]>([
    ['primary', rifle],
    ['primary', uncategorizedWeapon],
    ['secondary', pistol],
    ['melee', melee],
    ['armor', armor],
    ['backpack', backpack],
    ['container', artifactBag],
    ['quick1', ammo],
    ['quick2', ammo],
    ['quick3', consumable],
    ['quick4', consumable],
  ])('%s accepts %o', (slot, item) => {
    expect(acceptsEquipment(slot, item)).toBe(true);
  });

  it.each<[EquipmentSlot, { kind: string; category: string | null }]>([
    ['primary', melee],
    ['secondary', rifle],
    ['primary', pistol],
    ['melee', pistol],
    ['primary', armor],
    ['primary', artifactBag],
    ['secondary', backpack],
    ['melee', rifle],
    ['melee', armor],
    ['armor', rifle],
    ['backpack', artifactBag],
    ['backpack', unknownBag],
    ['container', backpack],
    ['container', unknownBag],
    ['container', artifact],
    ['quick1', rifle],
    ['quick2', artifactBag],
    ['quick3', artifact],
    ['quick4', attachment],
  ])('%s rejects %o', (slot, item) => {
    expect(acceptsEquipment(slot, item)).toBe(false);
  });

  it('maps an item to the slots the server accepts, most specific first', () => {
    expect(equipmentSlotsFor(rifle)).toEqual(['primary']);
    expect(equipmentSlotsFor(pistol)).toEqual(['secondary']);
    expect(equipmentSlotsFor(melee)).toEqual(['melee']);
    expect(equipmentSlotsFor(armor)).toEqual(['armor']);
    expect(equipmentSlotsFor(backpack)).toEqual(['backpack']);
    expect(equipmentSlotsFor(artifactBag)).toEqual(['container']);
    expect(equipmentSlotsFor(ammo)).toEqual(['quick1', 'quick2', 'quick3', 'quick4']);
    expect(equipmentSlotsFor(unknownBag)).toEqual([]);
    expect(equipmentSlotsFor(artifact)).toEqual([]);
    expect(equipmentSlotsFor(attachment)).toEqual([]);
  });
});
