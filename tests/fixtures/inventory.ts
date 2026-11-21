import type { Db } from '@profile/core';
import * as seed from '@profile/core/testing';

export interface SeedInventory {
  characterId: number;
  itemIds: Record<string, number>;
  instanceIds: Record<string, number>;
  storageIds: { inventory: number; stash: number; overflow: number };
}

/**
 * Seeds a small new-model profile: one equipped rifle, armor, an artifact
 * container with one installed artifact, and items in intake. Every row is
 * written through the inventory repositories, so the fixture obeys the
 * same constraints as application writes and creates no journal events.
 */
export function seedInventory(db: Db): SeedInventory {
  seed.ensureDefaultSources(db);
  const existingCharacter = seed.getCharacter(db);
  const characterId = existingCharacter
    ? existingCharacter.id
    : seed.upsertCharacter(db, { nick: 'inventory-fixture', region: 'ru' });

  seed.upsertStatDefinition(db, {
    id: 'speed_modifier',
    category: 'artifact',
    valueType: 'DECIMAL',
    labelRu: 'Скорость',
    labelEn: 'Speed',
  });

  const item = (
    key: string,
    name: string,
    kind: string,
    category: string | null,
    rank: string | null,
    weight: number | null,
  ): number =>
    seed.upsertItem(db, {
      sourceId: 'local',
      externalId: `fixture:${key}`,
      name,
      kind,
      category,
      rank,
      weight,
    });

  const itemIds: Record<string, number> = {
    rifle: item('weapon:rifle', 'АК-12', 'weapon', 'weapon/assault_rifle', 'rare', 3.8),
    smg: item('weapon:smg', 'ПП-19', 'weapon', 'weapon/submachine_gun', 'unordinary', 2.4),
    armor: item('armor:combat', 'Комбинезон', 'armor', 'armor/combat', 'rare', 4.2),
    backpack: item('container:backpack', 'Рюкзак', 'container', 'containers', 'rare', 1.2),
    artifact1: item('artifact:speed', 'Нервяк', 'artifact', 'artefact', 'rare', 0.1),
    artifact2: item('artifact:carry', 'Пузырь', 'artifact', 'artefact', 'rare', 0.1),
    scope: item('attachment:scope', 'Прицел', 'modification', 'attachment/scope', 'unordinary', 0.4),
    ammo: item('ammo:545', 'Патроны 5.45', 'ammo', 'bullet', null, 0.01),
  };

  for (const artifact of [itemIds.artifact1!, itemIds.artifact2!]) {
    seed.replaceItemStats(
      db,
      artifact,
      [{ key: 'speed_modifier', level: 15, valueNum: 5, pct: true, positive: true }],
      'local',
    );
  }

  const existingInventory = seed.getInventoryStorage(db, characterId);
  const inventoryId =
    existingInventory?.id ??
    seed.insertStorage(db, { characterId, kind: 'inventory', name: 'Inventory', width: 8, height: 20 });
  const existingStash = seed
    .listStorages(db, characterId)
    .find((storage) => storage.kind === 'stash' && storage.name === 'Stash');
  const stashId =
    existingStash?.id ??
    seed.insertStorage(db, { characterId, kind: 'stash', name: 'Stash', width: 40, height: 80, sortOrder: 0 });
  const existingOverflow = seed
    .listStorages(db, characterId)
    .find((storage) => storage.kind === 'overflow');
  const overflowId =
    existingOverflow?.id ??
    seed.insertStorage(db, {
      characterId,
      kind: 'overflow',
      name: 'Intake',
      width: 40,
      height: 80,
      sortOrder: 0,
    });

  const instance = (key: string, kind: string, extra: Partial<Parameters<typeof seed.insertInventoryItem>[1]> = {}) => {
    const id = seed.insertInventoryItem(db, {
      characterId,
      itemId: itemIds[key]!,
      kind,
      level: kind === 'modification' ? 0 : 15,
      ...extra,
    });
    return id;
  };

  const instanceIds: Record<string, number> = {
    rifle: instance('rifle', 'weapon'),
    smg: instance('smg', 'weapon'),
    armor: instance('armor', 'armor'),
    backpack: instance('backpack', 'container'),
    artifact1: instance('artifact1', 'artifact', { quality: 'Редкий 120%', rarityPct: 120, rarityTier: 'special' }),
    artifact2: instance('artifact2', 'artifact', { quality: 'Редкий 100%', rarityPct: 100 }),
    scope: instance('scope', 'modification'),
    ammo: instance('ammo', 'ammo', { qty: 30 }),
  };

  seed.upsertPlacement(db, {
    itemId: instanceIds.rifle!,
    characterId,
    location: 'equipment',
    equipmentSlot: 'primary',
  });
  seed.upsertPlacement(db, {
    itemId: instanceIds.armor!,
    characterId,
    location: 'equipment',
    equipmentSlot: 'armor',
  });
  seed.upsertPlacement(db, {
    itemId: instanceIds.backpack!,
    characterId,
    location: 'equipment',
    equipmentSlot: 'container',
  });
  seed.upsertPlacement(db, {
    itemId: instanceIds.artifact1!,
    characterId,
    location: 'container',
    containerItemId: instanceIds.backpack!,
    containerSlot: 0,
  });
  // Intake holds the former loose items on one column; the offsets exceed every default height.
  for (const [index, key] of (['smg', 'artifact2', 'scope', 'ammo'] as const).entries()) {
    seed.upsertPlacement(db, {
      itemId: instanceIds[key]!,
      characterId,
      location: 'grid',
      storageId: overflowId,
      x: 0,
      y: index * 4,
    });
  }

  seed.upsertContainerData(db, instanceIds.backpack!, { type: 'Backpack', slots: 2, eff: 100, protection: 50 });

  return {
    characterId,
    itemIds,
    instanceIds,
    storageIds: { inventory: inventoryId, stash: stashId, overflow: overflowId },
  };
}
