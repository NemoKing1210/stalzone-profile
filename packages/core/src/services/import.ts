import fs from 'node:fs';
import path from 'node:path';
import { norm, sha1, shortHash, slugify } from '@dossier/shared';
import type { Db } from '../db/index.js';
import * as repo from '../repo/index.js';
import { addItemStats, findItemByKindName, getItemById, kindFromCategory, replaceItemStats } from '../repo/items.js';
import type { StatInput } from '../repo/items.js';
import type { AppConfig } from '../config.js';

type Json = any;

export interface ImportReport {
  items: number;
  ownedRows: number;
  ownedCopies: number;
  builds: number;
  prices: number;
  icons: number;
  blocks: number;
  catalog: number;
  details: number;
  skipped: string[];
  local: string[];
}

const LABEL_PREFIX = 'stalker.artefact_properties.factor.';

function readJson(file: string): Json | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function localExboId(kind: string, name: string): string {
  return `local:${kind}:${shortHash(norm(name), 10)}`;
}

function shortStatKey(key: string): string {
  return key.startsWith(LABEL_PREFIX) ? key.slice(LABEL_PREFIX.length) : key;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function statLabel(labels: Record<string, string>, key: string): string | null {
  return labels[key] ?? labels[key.replace(/^kv:/, '')] ?? null;
}

const WEAPON_CATEGORY: Record<string, string> = {
  Автоматы: 'weapon/assault_rifle',
  Пулемёты: 'weapon/machine_gun',
  'Снайперские винтовки': 'weapon/sniper_rifle',
  Дробовики: 'weapon/shotgun_rifle',
  ПП: 'weapon/submachine_gun',
  Пистолеты: 'weapon/pistol',
  'Ближний бой': 'weapon/melee',
  Тяжёлое: 'weapon/heavy',
  Устройства: 'weapon/device',
  Прочее: 'weapon/other',
};

const ARMOR_CATEGORY: Record<string, string> = {
  боевая: 'armor/combat',
  комбинированная: 'armor/combined',
  научная: 'armor/scientific',
  прочее: 'armor/other',
};

function weaponCategory(type: string | null | undefined): string {
  return WEAPON_CATEGORY[String(type ?? '')] ?? `weapon/${slugify(String(type ?? 'other')).replace(/-/g, '_') || 'other'}`;
}

function armorCategory(cls: string | null | undefined): string {
  return ARMOR_CATEGORY[String(cls ?? '')] ?? `armor/${slugify(String(cls ?? 'other')) || 'other'}`;
}

function remoteIcon(rec: Json): string | null {
  if (!rec?.id || !rec?.cat) return null;
  return `https://raw.githubusercontent.com/EXBO-Studio/stalzone-database/main/ru/icons/${rec.cat}/${String(
    rec.id,
  ).toLowerCase()}.png`;
}

export function importLegacy(db: Db, cfg: AppConfig): ImportReport {
  const seeds = cfg.seedsDir;
  const legacy = readJson(path.join(seeds, 'legacy.json'));
  if (!legacy) throw new Error(`legacy seed not found: ${path.join(seeds, 'legacy.json')}`);

  const labels = (readJson(path.join(seeds, 'labels.json')) ?? {}) as Record<string, string>;
  const iconsFile = readJson(path.join(seeds, 'icons.json')) ?? { icons: {} };
  const profile = readJson(path.join(seeds, 'profile.json')) ?? {};
  const auction = readJson(path.join(seeds, 'auction-ru.json')) ?? { meta: {}, rows: [] };
  const extraItems = (readJson(path.join(seeds, 'extra-items.json')) ?? []) as Json[];
  const motifs = readJson(path.join(seeds, 'wiki', 'motifs-map.json')) ?? { rows: [] };
  const wiki = {
    weapon: (readJson(path.join(seeds, 'wiki', 'weapon.json')) ?? []) as Json[],
    armor: (readJson(path.join(seeds, 'wiki', 'armor.json')) ?? []) as Json[],
    artefact: (readJson(path.join(seeds, 'wiki', 'artefact.json')) ?? []) as Json[],
    containers: (readJson(path.join(seeds, 'wiki', 'containers.json')) ?? []) as Json[],
    ttk: (readJson(path.join(seeds, 'wiki', 'ttk_weapon.json')) ?? []) as Json[],
  };

  const report: ImportReport = {
    items: 0,
    ownedRows: 0,
    ownedCopies: 0,
    builds: 0,
    prices: 0,
    icons: 0,
    blocks: 0,
    catalog: 0,
    details: 0,
    skipped: [],
    local: [],
  };

  const run = db.transaction(() => {
    repo.ensureDefaultSources(db);

    /* ---------- 1. items from the local EXBO extras ---------- */
    for (const rec of extraItems) {
      const kind = kindFromCategory(rec.cat);
      const itemId = repo.upsertItem(db, {
        sourceId: 'exbo_base',
        exboId: String(rec.id),
        name: rec.ru,
        nameEn: rec.en ?? null,
        kind,
        category: rec.cat,
        rank: rec.rank,
        slot: typeof rec.st?.['kv:weapon.tooltip.weapon.info.weapon_type'] === 'string'
          ? rec.st['kv:weapon.tooltip.weapon.info.weapon_type']
          : null,
        weight: asNumber(rec.st?.['core.tooltip.info.weight']),
        raw: { exbo: rec, icon: remoteIcon(rec) },
      });
      addItemStats(db, itemId, exboStats(rec, labels), 'exbo_base');
    }

    /* ---------- 2. items from stalzone.wiki ---------- */
    const wikiGroups: [string, Json[]][] = [
      ['weapon', wiki.weapon],
      ['armor', wiki.armor],
      ['artifact', wiki.artefact],
      ['container', wiki.containers],
    ];
    for (const [kind, list] of wikiGroups) {
      for (const rec of list) {
        const name = rec?.name?.lines?.ru;
        if (!name) continue;
        const itemId = repo.upsertItem(db, {
          sourceId: 'wiki',
          exboId: rec.exbo_id ?? localExboId(kind, name),
          name,
          nameEn: rec?.name?.lines?.en ?? null,
          kind,
          category: rec.category ?? null,
          rank: rec.color ?? null,
          raw: { wiki: rec },
        });
        replaceItemStats(db, itemId, wikiStats(rec, labels), 'wiki');
      }
    }

    /* ---------- 3. ttk weapon stats (damage by level) ---------- */
    for (const rec of wiki.ttk) {
      const name = rec?.name?.lines?.ru;
      if (!name) continue;
      const itemId = repo.upsertItem(db, {
        sourceId: 'wiki',
        exboId: rec.exbo_id ?? localExboId('weapon', name),
        name,
        nameEn: rec?.name?.lines?.en ?? null,
        kind: 'weapon',
        category: rec.category ?? null,
        rank: rec.color ?? null,
        raw: { ttk: rec },
      });
      replaceItemStats(db, itemId, ttkStats(rec), 'wiki');
    }

    /* ---------- 4. details cards ---------- */
    const details = legacy.details ?? {};
    for (const [key, card] of Object.entries<Json>(details)) {
      const kind =
        card.kind === 'weapon' ? 'weapon' : card.kind === 'armor' ? 'armor' : card.kind === 'artifact' ? 'artifact' : 'container';
      let item = findItemByKindName(db, kind, card.name);
      if (!item) {
        const itemId = repo.upsertItem(db, {
          sourceId: 'local',
          exboId: localExboId(kind, card.name),
          name: card.name,
          kind,
          category: kind === 'weapon' ? weaponCategory(card.type) : kind === 'armor' ? armorCategory(card.cls) : null,
          rank: card.rank ?? null,
          slot: card.slot ?? null,
          weight: asNumber(card.weight),
          iconPath: card.icon ?? null,
          raw: { details: card },
        });
        item = getItemById(db, itemId);
      } else {
        repo.upsertItem(db, {
          sourceId: item.source_id,
          exboId: item.exbo_id,
          name: item.name,
          kind: item.kind,
          category: item.category,
          rank: card.rank ?? item.rank,
          slot: card.slot ?? item.slot,
          weight: card.weight ?? item.weight,
          iconPath: item.icon_path ?? card.icon ?? null,
          raw: { details: card },
        });
        item = getItemById(db, item.id)!;
      }
      if (!item) continue;
      addItemStats(db, item.id, detailsStats(card), 'local');
      repo.upsertDetailsCard(db, {
        key,
        itemId: item.id,
        kind,
        name: card.name,
        data: card,
      });
      report.details++;
      // keep the card in raw for compatibility with older consumers
      repo.upsertItem(db, {
        sourceId: item.source_id,
        exboId: item.exbo_id,
        name: item.name,
        kind: item.kind,
        category: item.category,
        raw: { details: card },
      });
    }

    /* ---------- 5. catalog entries (fill gaps, keep display fields) ---------- */
    for (const entry of legacy.catalog?.weapons ?? []) {
      let item = findItemByKindName(db, 'weapon', entry.name);
      if (!item) {
        const itemId = repo.upsertItem(db, {
          sourceId: 'local',
          exboId: localExboId('weapon', entry.name),
          name: entry.name,
          kind: 'weapon',
          category: weaponCategory(entry.type),
          rank: entry.rank,
          slot: entry.slot,
          weight: entry.weight,
          raw: { catalog: entry },
        });
        item = getItemById(db, itemId);
      } else {
        repo.upsertItem(db, {
          sourceId: item.source_id,
          exboId: item.exbo_id,
          name: item.name,
          kind: item.kind,
          category: item.category,
          rank: item.rank ?? entry.rank,
          slot: item.slot ?? entry.slot,
          weight: item.weight ?? entry.weight,
          raw: { catalog: entry },
        });
        item = getItemById(db, item.id)!;
      }
      if (item) addItemStats(db, item.id, catalogWeaponStats(entry), 'local');
    }
    for (const entry of legacy.catalog?.armor ?? []) {
      let item = findItemByKindName(db, 'armor', entry.name);
      if (!item) {
        const itemId = repo.upsertItem(db, {
          sourceId: 'local',
          exboId: localExboId('armor', entry.name),
          name: entry.name,
          kind: 'armor',
          category: armorCategory(entry.cls),
          rank: entry.rank,
          weight: entry.weight,
          raw: { catalog: entry },
        });
        item = getItemById(db, itemId);
      } else {
        repo.upsertItem(db, {
          sourceId: item.source_id,
          exboId: item.exbo_id,
          name: item.name,
          kind: item.kind,
          category: item.category,
          rank: item.rank ?? entry.rank,
          weight: item.weight ?? entry.weight,
          raw: { catalog: entry },
        });
        item = getItemById(db, item.id)!;
      }
      if (item) addItemStats(db, item.id, catalogArmorStats(entry), 'local');
    }

    const catalogWeapons = (legacy.catalog?.weapons ?? []) as Json[];
    const catalogArmor = (legacy.catalog?.armor ?? []) as Json[];
    repo.insertCatalogEntries(
      db,
      'weapon',
      catalogWeapons.map((entry) => ({ name: entry.name, data: entry })),
    );
    repo.insertCatalogEntries(
      db,
      'armor',
      catalogArmor.map((entry) => ({ name: entry.name, data: entry })),
    );
    report.catalog = catalogWeapons.length + catalogArmor.length;

    /* ---------- 6. motifs (cosmetic name -> base item) ---------- */
    for (const [index, row] of (motifs.rows ?? []).entries()) {
      if (!row?.skin) continue;
      const base = row.base ? findItemByKindName(db, 'weapon', row.base) ?? findItemByKindName(db, 'armor', row.base) : null;
      repo.upsertItem(db, {
        sourceId: 'local',
        exboId: `motif:${shortHash(norm(row.skin), 10)}:${index}`,
        name: row.skin,
        kind: 'motif',
        category: 'other',
        isCosmetic: true,
        baseItemId: base?.id ?? null,
        raw: { motif: row },
      });
    }

    /* ---------- 7. character ---------- */
    const profileStats = profile.stats ?? {};
    const characterId = repo.upsertCharacter(db, {
      nick: legacy.character?.nick ?? profile.username ?? 'unknown',
      realm: String(legacy.character?.realm ?? profile.region ?? 'RU').toLowerCase(),
      faction: legacy.character?.faction ?? profile.faction ?? null,
      alliance: legacy.character?.alliance ?? null,
      clan: legacy.character?.clan ?? null,
      arrived: legacy.character?.arrived ?? null,
      hours: legacy.character?.hours ?? profile.playtimeHours ?? null,
      kd: legacy.character?.kd ?? profile.kd ?? null,
      accuracy: legacy.character?.accuracy ?? profile.accuracy ?? null,
      headshot: legacy.character?.headshot ?? profile.headshotShare ?? null,
      achievements: legacy.character?.achievements ?? profileStats?.research?.['Achievements obtained'] ?? null,
      achievementPoints: legacy.character?.achievementPoints ?? profile.achievementPoints ?? null,
      money: legacy.character?.money ?? null,
      maxMoney: legacy.character?.maxMoney ?? null,
      stash: legacy.character?.stash ?? null,
      playstyle: legacy.character?.playstyle ?? null,
      stats: {
        profile: profileStats,
        profileMeta: {
          fetched: profile.fetched ?? null,
          source: profile.source ?? null,
          lastOnline: profile.lastOnline ?? null,
          clanHistory: profile.clanHistory ?? null,
        },
        career: legacy.career ?? [],
      },
    });
    repo.setMeta(db, 'meta', legacy.meta ?? {});
    repo.setMeta(db, 'career', legacy.career ?? []);
    repo.setMeta(db, 'profile', profile);
    repo.setMeta(db, 'catalog_order_weapons', (legacy.catalog?.weapons ?? []).map((w: Json) => w.name));
    repo.setMeta(db, 'catalog_order_armor', (legacy.catalog?.armor ?? []).map((a: Json) => a.name));

    /* ---------- 8. owned ---------- */
    const motifByName = new Map<string, number>();
    for (const item of repo.listItems(db, 'motif')) motifByName.set(item.name_norm, item.id);

    const skinId = (skin: string | null | undefined): number | null =>
      skin ? (motifByName.get(norm(skin)) ?? null) : null;

    interface OwnedGroup {
      itemId: number;
      level: number;
      skinItemId: number | null;
      quality: string | null;
      qty: number;
      name: string;
      role: string | null;
      slot: string | null;
      extra: Json;
    }

    const weaponGroups = new Map<string, OwnedGroup>();
    for (const weapon of legacy.weapons ?? []) {
      let item = findItemByKindName(db, 'weapon', weapon.name);
      if (!item) {
        item = createLocalWeapon(db, weapon);
        report.local.push(`weapon:${weapon.name}`);
      }
      const level = weapon.lvl ?? 0;
      const skinItemId = skinId(weapon.skin);
      const key = `${item.id}|${level}|${skinItemId ?? 0}`;
      const group = weaponGroups.get(key);
      if (group) {
        group.qty++;
      } else {
        weaponGroups.set(key, {
          itemId: item.id,
          level,
          skinItemId,
          quality: null,
          qty: 1,
          name: weapon.name,
          role: weapon.role ?? null,
          slot: weapon.slot ?? item.slot ?? null,
          extra: { skin: weapon.skin ?? null, legacy: weapon },
        });
      }
    }
    for (const group of weaponGroups.values()) {
      repo.upsertOwned(db, {
        characterId,
        kind: 'weapon',
        itemId: group.itemId,
        level: group.level,
        skinItemId: group.skinItemId,
        quality: group.quality,
        qty: group.qty,
        displayName: group.name,
        role: group.role,
        slot: group.slot,
        extra: group.extra,
      });
      report.ownedRows++;
      report.ownedCopies += group.qty;
    }

    const armorGroups = new Map<string, OwnedGroup>();
    for (const armor of legacy.armor ?? []) {
      let item = findItemByKindName(db, 'armor', armor.name);
      if (!item) {
        item = createLocalArmor(db, armor);
        report.local.push(`armor:${armor.name}`);
      }
      const level = armor.lvl ?? 0;
      const skinItemId = skinId(armor.skin);
      const quality = armor.q ?? null;
      const key = `${item.id}|${level}|${skinItemId ?? 0}|${norm(quality ?? '')}`;
      const group = armorGroups.get(key);
      if (group) {
        group.qty++;
      } else {
        armorGroups.set(key, {
          itemId: item.id,
          level,
          skinItemId,
          quality,
          qty: 1,
          name: armor.name,
          role: null,
          slot: null,
          extra: { skin: armor.skin ?? null, legacy: armor },
        });
      }
    }
    for (const group of armorGroups.values()) {
      repo.upsertOwned(db, {
        characterId,
        kind: 'armor',
        itemId: group.itemId,
        level: group.level,
        skinItemId: group.skinItemId,
        quality: group.quality,
        qty: group.qty,
        displayName: group.name,
        extra: group.extra,
      });
      report.ownedRows++;
      report.ownedCopies += group.qty;
    }

    for (const container of legacy.containers ?? []) {
      const item = findItemByKindName(db, 'container', container.name);
      if (!item) {
        report.skipped.push(`container:${container.name}`);
        continue;
      }
      const ownedId = repo.upsertOwned(db, {
        characterId,
        itemId: item.id,
        kind: 'container',
        level: 0,
        qty: 1,
        displayName: container.name,
        extra: {
          type: container.type ?? null,
          shield: container.shield ?? null,
          bonus: container.bonus ?? null,
          slots: container.slots ?? null,
          eff: container.eff ?? null,
          prot: container.prot ?? null,
          weight: container.weight ?? null,
          rank: container.rank ?? null,
        },
      });
      const fill = (container.artifacts ?? [])
        .map((a: Json) => {
          const artifact = findItemByKindName(db, 'artifact', a.name);
          return artifact ? { itemId: artifact.id, level: a.lvl ?? 0, quality: a.quality ?? null } : null;
        })
        .filter(Boolean) as { itemId: number; level: number; quality: string | null }[];
      repo.replaceContainerFill(db, ownedId, fill, container.artifactsAsOf ?? legacy.meta?.updated ?? new Date().toISOString());
      report.ownedRows++;
      report.ownedCopies++;
    }

    const artifactGroups = new Map<string, OwnedGroup>();
    for (const artifact of legacy.artifacts ?? []) {
      const item = findItemByKindName(db, 'artifact', artifact.name);
      if (!item) {
        report.skipped.push(`artifact:${artifact.name}`);
        continue;
      }
      const level = artifact.lvl ?? 0;
      const quality = artifact.q ?? null;
      const key = `${item.id}|${level}|${norm(quality ?? '')}`;
      const group = artifactGroups.get(key);
      if (group) {
        group.qty++;
      } else {
        artifactGroups.set(key, {
          itemId: item.id,
          level,
          skinItemId: null,
          quality,
          qty: 1,
          name: artifact.name,
          role: null,
          slot: null,
          extra: { type: artifact.type ?? null, effects: artifact.effects ?? null, rank: artifact.rank ?? null },
        });
      }
    }
    for (const group of artifactGroups.values()) {
      repo.upsertOwned(db, {
        characterId,
        kind: 'artifact',
        itemId: group.itemId,
        level: group.level,
        quality: group.quality,
        qty: group.qty,
        displayName: group.name,
        extra: group.extra,
      });
      report.ownedRows++;
      report.ownedCopies += group.qty;
    }

    /* ---------- 9. builds ---------- */
    const buildMeta = legacy.builds ?? {};
    (buildMeta.items ?? []).forEach((build: Json, index: number) => {
      const container = build.container ? findItemByKindName(db, 'container', build.container) : null;
      repo.saveBuild(db, {
        slug: build.id,
        title: build.title,
        short: build.short ?? null,
        tag: build.tag ?? null,
        goal: build.goal ?? null,
        containerItemId: container?.id ?? null,
        slots: build.slots ?? null,
        eff: build.eff ?? null,
        budget: build.budget ?? null,
        total: build.total ?? null,
        metrics: build.metrics ?? null,
        verdict: build.verdict ?? null,
        position: index,
        rows: (build.rows ?? []).map((row: Json) => {
          const item =
            (row.name && findItemByKindName(db, 'artifact', row.name)) ||
            (row.name && repo.searchItems(db, { q: row.name, limit: 1 })[0]) ||
            null;
          return {
            itemId: item?.id ?? null,
            label: row.name ?? null,
            quality: row.q ?? null,
            rank: row.rank ?? null,
            price: row.price ?? null,
            lots: row.lots ?? null,
            eff: row.eff ?? null,
            bonus: row.bonus ?? null,
            minus: row.minus ?? null,
            why: row.why ?? null,
          };
        }),
      });
      report.builds++;
    });
    repo.putBlock(db, {
      kind: 'builds_meta',
      payload: {
        updated: buildMeta.updated ?? null,
        priceNote: buildMeta.priceNote ?? null,
        avoid: buildMeta.avoid ?? [],
        current: buildMeta.current ?? null,
      },
      position: 0,
    });
    report.blocks++;

    /* ---------- 10. prose blocks ---------- */
    (legacy.recommendations ?? []).forEach((section: Json, index: number) => {
      repo.putBlock(db, {
        kind: 'recs',
        slug: section.id,
        title: section.title ?? null,
        lead: section.lead ?? null,
        payload: section,
        position: index,
      });
      report.blocks++;
    });
    if (legacy.earnings) {
      repo.putBlock(db, { kind: 'earnings', payload: legacy.earnings, position: 0 });
      report.blocks++;
    }
    (legacy.notes ?? []).forEach((note: Json, index: number) => {
      repo.putBlock(db, {
        kind: 'notes',
        slug: `note-${index + 1}`,
        title: note.title ?? null,
        payload: note,
        position: index,
      });
      report.blocks++;
    });
    if (legacy.catalog?.meta) {
      repo.putBlock(db, { kind: 'catalog_meta', payload: legacy.catalog.meta, position: 0 });
      report.blocks++;
    }

    /* ---------- 11. prices ---------- */
    const fetchedAt = auction.meta?.fetched_at ?? new Date().toISOString();
    const already = db
      .prepare(`SELECT 1 FROM price_snapshot WHERE source_id = 'scpmodel' AND fetched_at = ? LIMIT 1`)
      .get(fetchedAt);
    if (!already) {
      for (const row of auction.rows ?? []) {
        const item = row.id ? repo.getItemByExboId(db, String(row.id)) : null;
        repo.insertPriceSnapshot(db, {
          itemId: item?.id ?? null,
          exboId: row.id ?? null,
          name: row.n,
          quality: row.q ?? null,
          bonus: row.b ?? null,
          lotPrice: row.lot ?? null,
          lotCount: row.lots ?? null,
          currentPrice: row.p ?? null,
          lastTrade: row.last ?? null,
          lotUpdatedAt: row.upd ?? null,
          sourceId: 'scpmodel',
          fetchedAt,
        });
        report.prices++;
      }
      repo.markSourceOk(db, 'scpmodel', null, fetchedAt);
    } else {
      report.skipped.push('prices:already-imported');
    }

    /* ---------- 12. icons ---------- */
    for (const [key, dataUrl] of Object.entries<string>(iconsFile.icons ?? {})) {
      const hash = sha1(key);
      repo.upsertIcon(db, key, `icons/${hash}.webp`, 'local', mimeOf(dataUrl));
      report.icons++;
    }
    repo.setMeta(db, 'icons_meta', iconsFile.meta ?? {});

    report.items = repo.countItems(db);
  });

  run();
  return report;
}

/** Owned items missing from every source keep the exact dossier name and values. */
function createLocalWeapon(db: Db, weapon: Json) {
  const exboId = localExboId('weapon', weapon.name);
  const itemId = repo.upsertItem(db, {
    sourceId: 'local',
    exboId,
    name: weapon.name,
    kind: 'weapon',
    category: weaponCategory(weapon.type),
    rank: weapon.rank ?? null,
    slot: weapon.slot ?? null,
    weight: weapon.weight ?? null,
    raw: { ownedLegacy: weapon },
  });
  const stats: StatInput[] = [];
  if (typeof weapon.dmg === 'number') stats.push({ key: 'damage.start', level: weapon.lvl ?? 0, valueNum: weapon.dmg });
  if (typeof weapon.dmg15 === 'number') stats.push({ key: 'damage.start', level: 15, valueNum: weapon.dmg15 });
  if (typeof weapon.rof === 'number') stats.push({ key: 'weapon.tooltip.weapon.info.rate_of_fire', valueNum: weapon.rof });
  if (typeof weapon.mag === 'number') stats.push({ key: 'weapon.tooltip.weapon.info.clip_size', valueNum: weapon.mag });
  if (typeof weapon.spread === 'number') stats.push({ key: 'weapon.tooltip.weapon.info.spread', valueNum: weapon.spread });
  if (typeof weapon.recoil === 'number') stats.push({ key: 'weapon.tooltip.weapon.info.recoil', valueNum: weapon.recoil });
  if (typeof weapon.dist === 'number') stats.push({ key: 'weapon.tooltip.weapon.info.distance', valueNum: weapon.dist });
  if (typeof weapon.weight === 'number') stats.push({ key: 'core.tooltip.info.weight', valueNum: weapon.weight });
  if (weapon.caliber) stats.push({ key: 'kv:weapon.tooltip.weapon.info.ammo_type', valueText: String(weapon.caliber) });
  replaceItemStats(db, itemId, stats, 'local');
  return getItemById(db, itemId)!;
}

const PROT_TO_KEY: Record<string, string> = {
  bullet: 'bullet_dmg_factor',
  tear: 'tear_dmg_factor',
  explosion: 'explosion_dmg_factor',
  electric: 'electric_dmg_factor',
  fire: 'fire_dmg_factor',
  chem: 'chem_dmg_factor',
  rad: 'rad_dmg_factor',
  temp: 'temp_dmg_factor',
  bio: 'bio_dmg_factor',
  psy: 'psy_dmg_factor',
  bleed: 'bleeding_dmg_factor',
};

function createLocalArmor(db: Db, armor: Json) {
  const exboId = localExboId('armor', armor.name);
  const itemId = repo.upsertItem(db, {
    sourceId: 'local',
    exboId,
    name: armor.name,
    kind: 'armor',
    category: armorCategory(armor.cls),
    rank: armor.rank ?? null,
    weight: armor.weight ?? null,
    raw: { ownedLegacy: armor },
  });
  const stats: StatInput[] = [];
  if (typeof armor.armor === 'number') {
    stats.push({ key: 'bullet_dmg_factor', level: armor.lvl ?? 0, valueNum: armor.armor, label: 'Пулестойкость' });
  }
  if (typeof armor.armor15 === 'number') {
    stats.push({ key: 'bullet_dmg_factor', level: 15, valueNum: armor.armor15, label: 'Пулестойкость' });
  }
  if (typeof armor.weight === 'number') stats.push({ key: 'core.tooltip.info.weight', valueNum: armor.weight });
  for (const [shortKey, key] of Object.entries(PROT_TO_KEY)) {
    if (shortKey === 'bullet') continue;
    if (typeof armor.prot?.[shortKey] === 'number') {
      stats.push({ key, valueNum: armor.prot[shortKey], label: shortKey });
    }
  }
  (armor.mods ?? []).forEach((m: Json, index: number) => {
    stats.push({ key: `mod.${index}`, label: m.name, valueNum: m.value, pct: !!m.pct });
  });
  replaceItemStats(db, itemId, stats, 'local');
  return getItemById(db, itemId)!;
}

function mimeOf(dataUrl: string): string {
  const m = /^data:([^;]+);/.exec(dataUrl);
  return m?.[1] ?? 'image/webp';
}

/* ------------------------------- stats ------------------------------- */

function exboStats(rec: Json, labels: Record<string, string>): StatInput[] {
  const out: StatInput[] = [];
  for (const [rawKey, value] of Object.entries<Json>(rec?.st ?? {})) {
    const key = rawKey;
    const label = statLabel(labels, rawKey);
    if (typeof value === 'number') out.push({ key, label, valueNum: value });
    else if (Array.isArray(value)) out.push({ key, label, valueText: JSON.stringify(value) });
    else if (typeof value === 'string') out.push({ key, label, valueText: value });
  }
  return out;
}

function wikiStats(rec: Json, labels: Record<string, string>): StatInput[] {
  const out: StatInput[] = [];
  const push = (stat: Json, additional: boolean) => {
    const keyRaw = String(stat?.key ?? stat?.name?.key ?? '');
    if (!keyRaw) return;
    const key = shortStatKey(keyRaw);
    const label = stat?.name?.lines?.ru ?? statLabel(labels, keyRaw) ?? null;
    const variants = stat?.numericVariants;
    if (Array.isArray(variants) && variants.length) {
      variants.forEach((value: number, level: number) => {
        out.push({
          key,
          label,
          level,
          valueNum: asNumber(value),
          pct: !!stat.is_percentage,
          positive: stat.is_positive ?? null,
          isAdditional: additional,
        });
      });
      return;
    }
    const value = stat?.value ?? {};
    const min = asNumber(value.min) ?? asNumber(value.calculated);
    const max = asNumber(value.max) ?? asNumber(value.calculated);
    const isRange = stat?.type === 'range' || (min != null && max != null && min !== max);
    out.push({
      key,
      label,
      valueNum: isRange ? null : (value.calculated ?? min ?? max ?? null),
      valueMin: isRange ? min : null,
      valueMax: isRange ? max : null,
      pct: !!stat.is_percentage,
      positive: stat.is_positive ?? null,
      isAdditional: additional,
    });
  };
  for (const stat of rec?.stats ?? []) push(stat, false);
  for (const stat of rec?.additionalStats ?? []) push(stat, true);
  return out;
}

function ttkStats(rec: Json): StatInput[] {
  const out: StatInput[] = [];
  const dv = rec?.damageVariants ?? {};
  const variants: [string, string][] = [
    ['startDamageVariants', 'damage.start'],
    ['endDamageVariants', 'damage.end'],
    ['damageDecreaseStartVariants', 'damage.decrease_start'],
    ['damageDecreaseEndVariants', 'damage.decrease_end'],
    ['maxDistanceVariants', 'damage.max_distance'],
  ];
  for (const [field, key] of variants) {
    const arr = dv[field];
    if (!Array.isArray(arr)) continue;
    arr.slice(0, 16).forEach((value: number, level: number) => {
      out.push({ key, level, valueNum: asNumber(value) });
    });
  }
  const labelByKey: Record<string, string> = {
    damage_start: 'Урон',
    damage_end: 'Урон на дальней дистанции',
    damage_decrease_start: 'Начало падения урона',
    damage_decrease_end: 'Конец падения урона',
    damage_max_distance: 'Максимальная дистанция',
  };
  for (const stat of rec?.stats ?? []) {
    const key = String(stat?.name?.key ?? stat?.key ?? '');
    if (!key) continue;
    const value = stat?.value;
    if (typeof value === 'number') out.push({ key, label: stat?.name?.lines?.ru ?? null, valueNum: value });
    else if (value && typeof value === 'object') {
      const v = asNumber(value.calculated) ?? asNumber(value.min);
      if (v != null) out.push({ key, label: stat?.name?.lines?.ru ?? null, valueNum: v });
    }
  }
  void labelByKey;
  if (asNumber(rec?.clipSize) != null) {
    out.push({ key: 'weapon.tooltip.weapon.info.clip_size', label: 'Объем магазина', valueNum: rec.clipSize });
  }
  if (rec?.ammoType?.value?.lines?.ru) {
    out.push({
      key: 'kv:weapon.tooltip.weapon.info.ammo_type',
      label: 'Тип боеприпасов',
      valueText: rec.ammoType.value.lines.ru,
    });
  }
  if (asNumber(rec?.maxDistance) != null) {
    out.push({ key: 'weapon.tooltip.weapon.info.distance', label: 'Максимальная дистанция', valueNum: rec.maxDistance });
  }
  return out;
}

function detailsStats(card: Json): StatInput[] {
  const out: StatInput[] = [];
  const add = (key: string, value: unknown, label?: string) => {
    if (typeof value === 'number') out.push({ key, valueNum: value, label: label ?? null });
  };
  if (card.kind === 'weapon') {
    add('weapon.tooltip.weapon.info.clip_size', card.mag, 'Объем магазина');
    add('weapon.tooltip.weapon.info.rate_of_fire', card.rof, 'Скорострельность');
    add('weapon.tooltip.weapon.info.spread', card.spread, 'Разброс');
    add('weapon.tooltip.weapon.info.hip_spread', card.hipSpread, 'Разброс от бедра');
    add('weapon.tooltip.weapon.info.recoil', card.recoil, 'Отдача');
    add('weapon.tooltip.magazine.info.reload_time', card.reload, 'Перезарядка');
    add('weapon.tooltip.magazine.info.reload_time_tactical', card.reloadTac, 'Тактическая перезарядка');
    add('weapon.stat_factor.reload_modifier', card.ergonomics, 'Эргономика');
    add('weapon.tooltip.weapon.info.draw_time', card.draw, 'Время доставания');
    add('weapon.tooltip.weapon.info.aim_switch', card.aim, 'Время прицеливания');
    add('weapon.tooltip.weapon.info.plate_penetrating', card.platePen, 'Пробитие плит');
    add('weapon.tooltip.weapon.info.piercing', card.pierce, 'Пробитие');
    add('core.tooltip.info.weight', card.weight, 'Вес');
    add('weapon.tooltip.weapon.info.head_damage_multiplier', card.mods3?.head, 'Урон в голову');
    add('weapon.tooltip.weapon.info.limbs_damage_multiplier', card.mods3?.limbs, 'Урон по конечностям');
    if (card.caliber) out.push({ key: 'kv:weapon.tooltip.weapon.info.ammo_type', valueText: card.caliber, label: 'Калибр' });
    for (const [level, key] of [
      [0, 'p0'],
      [15, 'p15'],
    ] as const) {
      const p = card[key];
      if (!p) continue;
      add2(out, 'damage.start', level, p.d0);
      add2(out, 'damage.end', level, p.dB);
      add2(out, 'damage.decrease_start', level, p.distA);
      add2(out, 'damage.decrease_end', level, p.distB);
      add2(out, 'damage.max_distance', level, p.distMax);
    }
  } else if (card.kind === 'armor') {
    add('core.tooltip.info.weight', card.weight, 'Вес');
    const map: Record<string, string> = {
      bullet: 'bullet_dmg_factor',
      tear: 'tear_dmg_factor',
      explosion: 'explosion_dmg_factor',
      electric: 'electric_dmg_factor',
      fire: 'fire_dmg_factor',
      chem: 'chem_dmg_factor',
      rad: 'rad_dmg_factor',
      temp: 'temp_dmg_factor',
      bio: 'bio_dmg_factor',
      psy: 'psy_dmg_factor',
      bleed: 'bleeding_dmg_factor',
    };
    for (const [shortKey, key] of Object.entries(map)) {
      add(key, card.prot?.[shortKey], shortKey);
    }
    if (Array.isArray(card.curve)) {
      card.curve.slice(0, 16).forEach((v: number, level: number) => {
        out.push({ key: 'bullet_dmg_factor', level, valueNum: v, label: 'Пулестойкость' });
      });
    }
    (card.mods ?? []).forEach((m: Json, index: number) => {
      out.push({
        key: `mod.${index}`,
        label: m.name,
        valueNum: m.value,
        pct: !!m.pct,
      });
    });
  } else if (card.kind === 'container') {
    add('container.slots', card.slots, 'Слотов');
    add('container.effectiveness', card.eff, 'Эффективность');
    add('container.protection', card.prot, 'Защита');
    add('container.slot_equivalent', card.slotEq, 'Слот-эквивалент');
  }
  return out;
}

function add2(out: StatInput[], key: string, level: number, value: unknown): void {
  if (typeof value === 'number') out.push({ key, level, valueNum: value });
}

function catalogWeaponStats(entry: Json): StatInput[] {
  const out: StatInput[] = [];
  const add = (key: string, value: unknown) => {
    if (typeof value === 'number') out.push({ key, valueNum: value, level: 15 });
  };
  add('damage.start', entry.dmg15);
  add('weapon.tooltip.weapon.info.rate_of_fire', entry.rof);
  add('weapon.tooltip.weapon.info.clip_size', entry.mag);
  add('weapon.tooltip.weapon.info.spread', entry.spread);
  add('weapon.tooltip.weapon.info.recoil', entry.recoil);
  add('weapon.tooltip.weapon.info.distance', entry.dist);
  add('core.tooltip.info.weight', entry.weight);
  if (entry.caliber) out.push({ key: 'kv:weapon.tooltip.weapon.info.ammo_type', valueText: String(entry.caliber), level: 15 });
  return out;
}

function catalogArmorStats(entry: Json): StatInput[] {
  const out: StatInput[] = [];
  if (typeof entry.weight === 'number') out.push({ key: 'core.tooltip.info.weight', valueNum: entry.weight });
  if (typeof entry.armor15 === 'number') {
    out.push({ key: 'bullet_dmg_factor', level: 15, valueNum: entry.armor15, label: 'Пулестойкость' });
  }
  const map: Record<string, string> = {
    tear: 'tear_dmg_factor',
    explosion: 'explosion_dmg_factor',
    electric: 'electric_dmg_factor',
    fire: 'fire_dmg_factor',
    chem: 'chem_dmg_factor',
    rad: 'rad_dmg_factor',
    temp: 'temp_dmg_factor',
    bio: 'bio_dmg_factor',
    psy: 'psy_dmg_factor',
    bleed: 'bleeding_dmg_factor',
  };
  for (const [shortKey, key] of Object.entries(map)) {
    if (typeof entry.prot?.[shortKey] === 'number') out.push({ key, valueNum: entry.prot[shortKey] });
  }
  (entry.mods ?? []).forEach((m: Json, index: number) => {
    out.push({ key: `mod.${index}`, label: m.name, valueNum: m.value, pct: !!m.pct });
  });
  return out;
}
