import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '@profile/core';
import * as seed from '@profile/core/testing';

type Json = Record<string, any>;

interface Fixture {
  sources?: { id: string }[];
  stats?: { id: string; category?: string | null; type?: string | null; labelRu?: string | null; labelEn?: string | null }[];
  items?: {
    sourceId?: string;
    externalId: string;
    name: string;
    nameEn?: string | null;
    kind?: string;
    category?: string | null;
    rank?: string | null;
    slot?: string | null;
    weight?: number | null;
    isCosmetic?: boolean;
    baseExternalId?: string | null;
    icon?: { path: string; mime?: string; sha1: string } | null;
    stats?: Json[];
    effects?: Json[];
  }[];
  character?: Json;
  characterStats?: { statId: string; valueNum?: number | null; valueText?: string | null; origin?: 'api' | 'manual' }[];
  owned?: Json[];
  containerSlots?: Json[];
  prices?: Json[];
}

const STAT_TYPES = ['INTEGER', 'DECIMAL', 'DATE', 'DURATION', 'TEXT'] as const;
type StatType = (typeof STAT_TYPES)[number];

function statType(value: string | null | undefined): StatType | null {
  return value && (STAT_TYPES as readonly string[]).includes(value) ? (value as StatType) : null;
}

/**
 * Seeds a public/synthetic catalog through repositories only, so every row
 * obeys the same constraints and event-free invariants as synced data.
 */
export function seedCatalog(db: Db): void {
  const data = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'catalog.json'), 'utf8'),
  ) as Fixture;

  const run = db.transaction(() => {
    for (const source of data.sources ?? []) seed.ensureSource(db, source.id);
    for (const stat of data.stats ?? []) {
      seed.upsertStatDefinition(db, {
        id: stat.id,
        category: stat.category ?? null,
        valueType: statType(stat.type),
        labelRu: stat.labelRu ?? null,
        labelEn: stat.labelEn ?? null,
      });
    }

    const itemIds = new Map<string, number>();
    for (const item of data.items ?? []) {
      const sourceId = item.sourceId ?? 'local';
      const id = seed.upsertItem(db, {
        sourceId,
        externalId: item.externalId,
        name: item.name,
        nameEn: item.nameEn ?? null,
        kind: item.kind,
        category: item.category ?? null,
        rank: item.rank ?? null,
        slot: item.slot ?? null,
        weight: item.weight ?? null,
        isCosmetic: item.isCosmetic,
      });
      itemIds.set(item.externalId, id);
      if (item.stats?.length) seed.replaceItemStats(db, id, item.stats as never, sourceId);
      if (item.effects?.length) seed.replaceItemEffects(db, id, item.effects as never);
      if (item.icon) seed.upsertIcon(db, { itemId: id, sourceId, ...item.icon });
    }

    for (const item of data.items ?? []) {
      if (!item.baseExternalId) continue;
      const baseItemId = itemIds.get(item.baseExternalId);
      const id = itemIds.get(item.externalId);
      if (!baseItemId || !id) continue;
      seed.upsertItem(db, {
        sourceId: item.sourceId ?? 'local',
        externalId: item.externalId,
        name: item.name,
        kind: item.kind,
        baseItemId,
      });
    }

    const characterId = seed.upsertCharacter(db, data.character as never);
    for (const stat of data.characterStats ?? []) {
      const value = stat.valueNum ?? stat.valueText;
      if (value == null) continue;
      seed.setCharacterStat(db, characterId, stat.statId, value, stat.origin ?? 'api');
    }

    const ownedIds = new Map<string, number>();
    for (const owned of data.owned ?? []) {
      const itemId = itemIds.get(String(owned.itemExternalId));
      if (!itemId) continue;
      const ownedId = seed.upsertOwned(db, {
        characterId,
        itemId,
        kind: owned.kind,
        level: owned.level ?? 0,
        qty: owned.qty ?? 1,
        quality: owned.quality ?? null,
        skinItemId: owned.skinExternalId ? (itemIds.get(String(owned.skinExternalId)) ?? null) : null,
        container: owned.container ?? null,
      });
      ownedIds.set(String(owned.itemExternalId), ownedId);
    }

    for (const fill of data.containerSlots ?? []) {
      const ownedId = ownedIds.get(String(fill.containerItemExternalId));
      if (!ownedId) continue;
      seed.replaceContainerSlots(
        db,
        ownedId,
        (fill.slots ?? []).map((slot: Json) => ({
          itemId: itemIds.get(String(slot.itemExternalId))!,
          level: slot.level ?? 0,
          quality: slot.quality ?? null,
        })),
        String(fill.asOf),
      );
    }

    for (const price of data.prices ?? []) seed.insertPriceQuote(db, price as never);  });
  run();
}
