import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EventReadSchema, ItemSummarySchema, PlacementReadSchema, PriceRowSchema, SourceStatusSchema } from '@profile/shared/contracts';
import { itemSummary } from '@profile/core';
import { eventJson } from '../../server/utils/serialize';
import { placementRead } from '@profile/core/modules/inventory';
import { priceRead } from '@profile/core/modules/catalog';
import { sourceRead } from '@profile/core/modules/sync';

describe('HTTP serializers', () => {
  it('produces contract-valid item and event objects', () => {
    const item = itemSummary(
      {
        id: 1,
        external_id: 'x',
        name: 'AK',
        name_en: null,
        kind: 'weapon',
        category: null,
        rank: null,
        slot: null,
        weight: null,
        is_cosmetic: 0,
      } as never,
      null,
    );
    expect(ItemSummarySchema.parse(item).name).toBe('AK');
    const event = eventJson({
      id: 1,
      at: '2026-01-01T00:00:00.000Z',
      actor: 'owner',
      action: 'x',
      entity: 'owned',
      entity_id: '1',
      before: null,
      after: '{"a":1}',
      note: null,
      request_id: 'req-1',
      origin: 'http',
      summary: null,
    });
    expect(EventReadSchema.parse(event)).toMatchObject({
      after: { a: 1 },
      requestId: 'req-1',
      origin: 'http',
      summary: { kind: 'create', fields: ['a'] },
    });
  });

  it('maps module rows to placement, price and source contract DTOs', () => {
    const placement = placementRead({
      item_id: 1,
      character_id: 1,
      location: 'equipment',
      storage_id: null,
      x: null,
      y: null,
      rotated: 0,
      equipment_slot: 'primary',
      container_item_id: null,
      container_slot: null,
      weapon_item_id: null,
      module_slot: null,
      verified: 0,
      updated_at: '2026-01-01T00:00:00.000Z',
    } as never);
    expect(PlacementReadSchema.parse(placement)).toMatchObject({ location: 'equipment', slot: 'primary' });

    const price = priceRead({
      id: 3,
      item_id: 2,
      external_id: 'exbo-ak',
      name: 'AK',
      quality: null,
      bonus: null,
      lot_price: 100,
      lot_count: 5,
      current_price: 95,
      last_trade: 90,
      lot_updated_at: null,
      source_id: 'scpmodel',
      fetched_at: '2026-01-01T00:00:00.000Z',
    } as never);
    expect(PriceRowSchema.parse(price)).toMatchObject({ itemId: 2, lotPrice: 100, sourceId: 'scpmodel' });

    const source = sourceRead({
      id: 'exbo_base',
      status: 'ok',
      last_ok_at: '2026-01-01T00:00:00.000Z',
      last_try_at: '2026-01-01T00:00:00.000Z',
      last_error: null,
    } as never);
    expect(SourceStatusSchema.parse(source)).toMatchObject({ id: 'exbo_base', status: 'ok' });
  });

  it('keeps test-only helpers out of the serializer module', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'server/utils/serialize.ts'), 'utf8');
    expect(source).not.toContain('itemJson');
  });
});
