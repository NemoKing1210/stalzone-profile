import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EventReadSchema, ItemSummarySchema, OwnedReadSchema, PriceRowSchema, SourceStatusSchema } from '@dossier/shared/contracts';
import { itemSummary } from '@dossier/core';
import { eventJson } from '../../server/utils/serialize';
import { ownedRead } from '@dossier/core/modules/inventory';
import { priceRead } from '@dossier/core/modules/catalog';
import { sourceRead } from '@dossier/core/modules/sync';

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
    });
    expect(EventReadSchema.parse(event).after).toEqual({ a: 1 });
  });

  it('maps module rows to owned, price and source contract DTOs', () => {
    const owned = ownedRead(
      {
        id: 1,
        item_id: 2,
        item_name: 'AK',
        display_name: null,
        external_id: 'exbo-ak',
        kind: 'weapon',
        category: 'weapon/assault_rifle',
        level: 1,
        quality: null,
        note: null,
        role: null,
        slot: 'основное',
        qty: 1,
        skin_item_id: null,
        item_icon: '/icons/ak.webp',
        updated_at: '2026-01-01T00:00:00.000Z',
      } as never,
      null,
    );
    expect(OwnedReadSchema.parse(owned)).toMatchObject({ id: 1, itemId: 2, icon: '/icons/ak.webp', container: null });

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
