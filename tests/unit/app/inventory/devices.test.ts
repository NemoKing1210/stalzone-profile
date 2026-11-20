import { describe, expect, it } from 'vitest';
import type { ProfilePayload } from '~/shared/types/profile';

import { devicesKind } from '~/features/inventory/model/kinds/devices';

function payload(): ProfilePayload {
  return {
    catalog: {
      weapons: [],
      armor: [],
      devices: [
        { name: 'ПНВ', rank: 'RANK_RARE', type: 'ПНВ', category: 'armor/device', icon: '/icons/nvg.webp', weight: 1.2 },
        { name: 'САК-1', rank: 'RANK_MASTER', type: null, category: 'device/device', icon: null, weight: null },
      ],
      meta: { updated: null, source: '', items: 17 },
    },
  } as unknown as ProfilePayload;
}

describe('devices screen model', () => {
  it('maps the catalog.devices group to rows with a stable key', () => {
    const rows = devicesKind.toRows(payload());
    expect(rows).toMatchObject([
      {
        key: 'device-0-ПНВ',
        name: 'ПНВ',
        rank: 'RANK_RARE',
        type: 'ПНВ',
        category: 'armor/device',
        weight: 1.2,
        icon: '/icons/nvg.webp',
      },
      { key: 'device-1-САК-1', name: 'САК-1', type: 'device/device', icon: null, weight: null },
    ]);
  });

  it('has no rows before the payload and no edit target for a catalog row', () => {
    expect(devicesKind.toRows(null)).toEqual([]);
    expect(devicesKind.columns({ mode: 'owned', catalog: false })[0]).toMatchObject({ key: 'icon' });
    expect(devicesKind.editTarget(devicesKind.toRows(payload())[0]!)).toBeNull();
  });
});
