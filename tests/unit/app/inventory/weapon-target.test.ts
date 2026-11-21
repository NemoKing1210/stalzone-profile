import { describe, expect, it } from 'vitest';

import { withTargetHp, type WeaponRow } from '~/features/inventory/model/kinds/weapons';

function row(patch: Partial<WeaponRow> = {}): WeaponRow {
  return {
    key: 'w',
    qty: 1,
    quality: null,
    skin: null,
    slot: null,
    name: 'AK',
    rank: 'common',
    type: 'rifle',
    lvl: 15,
    dmg: 55,
    dmg15: 55,
    rof: 600,
    dps: 550,
    dps15: 550,
    ttk: 1,
    ttk15: 1,
    mag: 30,
    caliber: '5.45',
    weight: 3.8,
    icon: null,
    instanceId: 1,
    item: null,
    virtual: false,
    placement: null,
    location: null,
    storageId: null,
    storageName: null,
    storageKind: null,
    parentName: null,
    equipmentSlot: null,
    moduleSlot: null,
    slotIndex: null,
    p0: null,
    p15: null,
    ...patch,
  };
}

describe('withTargetHp', () => {
  it('keeps the server TTK at the default 600 HP dummy', () => {
    const [result] = withTargetHp([row()], 600);
    expect(result?.ttk).toBe(1);
    expect(result?.ttk15).toBe(1);
  });

  it('recomputes both levels from the chosen dummy health', () => {
    const [result] = withTargetHp([row({ dmg15: 27.5 })], 1200);
    expect(result?.ttk).toBe(2.1);
    expect(result?.ttk15).toBe(4.3);
  });

  it('leaves a missing damage or rate of fire as no data', () => {
    const [result] = withTargetHp([row({ dmg: null })], 900);
    expect(result?.ttk).toBeNull();
    expect(result?.ttk15).toBe(1.6);
  });
});
