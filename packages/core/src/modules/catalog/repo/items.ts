import { norm } from '@profile/shared';
import type { Db } from '../../../platform/db/index.js';
import { cachedStatement } from '../../../platform/db/index.js';
import { sourcePriority } from '../source-priority.js';
import { ensureStatDefinition } from './stats.js';

export interface ItemRow {
  id: number;
  source_id: string;
  realm: string;
  external_id: string;
  name: string;
  name_norm: string;
  name_en: string | null;
  name_en_norm: string;
  name_key: string | null;
  kind: string;
  category: string | null;
  rank: string | null;
  slot: string | null;
  weight: number | null;
  is_cosmetic: number;
  base_item_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ItemInput {
  sourceId?: string;
  externalId: string;
  realm?: string;
  name: string;
  nameEn?: string | null;
  nameKey?: string | null;
  kind?: string;
  category?: string | null;
  rank?: string | null;
  slot?: string | null;
  weight?: number | null;
  isCosmetic?: boolean;
  baseItemId?: number | null;
}

export interface ItemStatRow {
  item_id: number;
  stat_id: string;
  label: string | null;
  level: number;
  value_num: number | null;
  value_min: number | null;
  value_max: number | null;
  value_text: string | null;
  pct: number;
  is_positive: number | null;
  is_additional: number;
  source_id: string | null;
}

export interface StatInput {
  sourceId?: string;
  key: string;
  label?: string | null;
  level?: number;
  valueNum?: number | null;
  valueMin?: number | null;
  valueMax?: number | null;
  valueText?: string | null;
  pct?: boolean;
  positive?: boolean | null;
  isAdditional?: boolean;
}

export function kindFromCategory(category: string | null | undefined, nameKey?: string | null): string {
  const cat = String(category ?? '');
  // A style row is a cosmetic motif, never the gear it paints.
  if (/^[a-z]+_style(?:\/|$)/i.test(cat) || /(motif|style)/i.test(String(nameKey ?? ''))) return 'motif';
  if (cat.startsWith('weapon/')) return 'weapon';
  if (cat.startsWith('armor/')) return 'armor';
  if (cat.startsWith('artefact/')) return 'artifact';
  if (cat === 'containers' || cat.startsWith('containers/') || cat === 'backpacks' || cat.startsWith('backpacks/'))
    return 'container';
  if (cat === 'attachment' || cat.startsWith('attachment/')) return 'attachment';
  if (cat === 'bullet' || cat.includes('/bullet')) return 'ammo';
  return 'other';
}

export function isCosmeticCategory(category: string | null | undefined, nameKey?: string | null): boolean {
  const cat = String(category ?? '');
  const key = String(nameKey ?? '');
  return /^[a-z]+_style(?:\/|$)/i.test(cat) || (cat === 'other' && /(motif|style)/i.test(key));
}

export function upsertItem(db: Db, input: ItemInput): number {
  const realm = input.realm ?? 'ru';
  const sourceId = input.sourceId ?? 'local';
  const existing = cachedStatement(db, `SELECT id FROM item WHERE realm = ? AND external_id = ?`).get(
    realm,
    input.externalId,
  ) as { id: number } | undefined;

  const kind = input.kind ?? (input.category ? kindFromCategory(input.category) : null);
  const now = new Date().toISOString();
  const values = {
    source_id: sourceId,
    realm,
    external_id: input.externalId,
    name: input.name,
    name_norm: norm(input.name),
    name_en: input.nameEn ?? null,
    name_en_norm: input.nameEn == null ? '' : norm(input.nameEn),
    name_key: input.nameKey ?? null,
    kind,
    category: input.category ?? null,
    rank: input.rank ?? null,
    slot: input.slot ?? null,
    weight: input.weight ?? null,
    is_cosmetic: input.isCosmetic == null ? null : input.isCosmetic ? 1 : 0,
    base_item_id: input.baseItemId ?? null,
  };

  if (existing) {
    cachedStatement(
      db,
      `UPDATE item SET
        source_id = @source_id,
        name = @name, name_norm = @name_norm,
        name_en = COALESCE(@name_en, name_en),
        name_en_norm = CASE WHEN @name_en IS NULL THEN name_en_norm ELSE @name_en_norm END,
        name_key = COALESCE(@name_key, name_key),
        kind = COALESCE(@kind, kind),
        category = COALESCE(@category, category),
        rank = COALESCE(@rank, rank),
        slot = COALESCE(@slot, slot),
        weight = COALESCE(@weight, weight),
        is_cosmetic = CASE WHEN @is_cosmetic IS NULL THEN is_cosmetic ELSE @is_cosmetic END,
        base_item_id = COALESCE(@base_item_id, base_item_id),
        updated_at = @updated_at
      WHERE id = @id`,
    ).run({
      source_id: values.source_id,
      name: values.name,
      name_norm: values.name_norm,
      name_en: values.name_en,
      name_en_norm: values.name_en_norm,
      name_key: values.name_key,
      kind,
      category: values.category,
      rank: values.rank,
      slot: values.slot,
      weight: values.weight,
      is_cosmetic: values.is_cosmetic,
      base_item_id: values.base_item_id,
      updated_at: now,
      id: existing.id,
    });
    return existing.id;
  }

  const info = cachedStatement(
    db,
    `INSERT INTO item
        (source_id, realm, external_id, name, name_norm, name_en, name_en_norm, name_key, kind, category, rank, slot,
         weight, is_cosmetic, base_item_id, created_at, updated_at)
       VALUES
        (@source_id, @realm, @external_id, @name, @name_norm, @name_en, @name_en_norm, @name_key, @kind, @category,
         @rank, @slot, @weight, @is_cosmetic, @base_item_id, @created_at, @updated_at)`,
  ).run({
      ...values,
      kind: kind ?? 'other',
      is_cosmetic: values.is_cosmetic ?? 0,
      created_at: now,
      updated_at: now,
    });
  return Number(info.lastInsertRowid);
}

function insertStat(db: Db, itemId: number, stat: StatInput, mode: 'replace' | 'ignore'): void {
  ensureStatDefinition(db, stat.key);
  const sql = `INSERT OR ${mode === 'ignore' ? 'IGNORE' : 'REPLACE'} INTO item_stat
    (item_id, stat_id, label, level, value_num, value_min, value_max, value_text, pct, is_positive, is_additional, source_id)
    VALUES (@item_id, @stat_id, @label, @level, @value_num, @value_min, @value_max, @value_text, @pct, @is_positive, @is_additional, @source_id)`;
  cachedStatement(db, sql).run({
    item_id: itemId,
    stat_id: stat.key,
    label: stat.label ?? null,
    level: stat.level ?? 0,
    value_num: stat.valueNum ?? null,
    value_min: stat.valueMin ?? null,
    value_max: stat.valueMax ?? null,
    value_text: stat.valueText ?? null,
    pct: stat.pct ? 1 : 0,
    is_positive: stat.positive == null ? null : stat.positive ? 1 : 0,
    is_additional: stat.isAdditional ? 1 : 0,
    source_id: stat.sourceId ?? null,
  });
}

/**
 * Replaces every stat this source previously wrote for the item. A stat slot the
 * item already carries from a higher-priority source is left alone, so the writer
 * applies the same precedence the reader does.
 */
export function replaceItemStats(db: Db, itemId: number, stats: StatInput[], sourceId: string): void {
  const run = () => {
    cachedStatement(db, `DELETE FROM item_stat WHERE item_id = ? AND source_id IS ?`).run(itemId, sourceId);
    const owners = new Map<string, string | null>();
    const rows = cachedStatement(
      db,
      `SELECT stat_id, level, is_additional, source_id FROM item_stat WHERE item_id = ?`,
    ).all(itemId) as { stat_id: string; level: number; is_additional: number; source_id: string | null }[];
    for (const row of rows) owners.set(`${row.stat_id}\u0000${row.level}\u0000${row.is_additional}`, row.source_id);
    for (const stat of stats) {
      const key = `${stat.key}\u0000${stat.level ?? 0}\u0000${stat.isAdditional ? 1 : 0}`;
      const owner = owners.get(key);
      if (owner != null && sourcePriority(owner) < sourcePriority(sourceId)) continue;
      insertStat(db, itemId, { ...stat, sourceId }, 'replace');
    }
  };
  // Inside a sync transaction the outer transaction already guarantees atomicity.
  if (db.inTransaction) run();
  else db.transaction(run)();
}

/** Adds stats only where the (item, stat, level, additional) slot is still empty. */
export function addItemStats(db: Db, itemId: number, stats: StatInput[], sourceId: string): void {
  const run = () => {
    for (const stat of stats) insertStat(db, itemId, { ...stat, sourceId }, 'ignore');
  };
  if (db.inTransaction) run();
  else db.transaction(run)();
}

export function getItemById(db: Db, id: number): ItemRow | null {
  return (
    (cachedStatement(db, `SELECT * FROM item WHERE id = ?`).get(id) as ItemRow | undefined) ?? null
  );
}

export function getItemByExternalId(db: Db, externalId: string, realm = 'ru'): ItemRow | null {
  return (
    (cachedStatement(db, `SELECT * FROM item WHERE realm = ? AND external_id = ?`).get(realm, externalId) as
      | ItemRow
      | undefined) ?? null
  );
}

/** Resolves an EXBO translation key to the item it names; usually a weapon. */
export function findItemByNameKey(db: Db, nameKey: string, realm = 'ru', kind?: string): ItemRow | null {
  if (kind) {
    return (
      (cachedStatement(db, `SELECT * FROM item WHERE realm = ? AND name_key = ? AND kind = ? ORDER BY id LIMIT 1`).get(
        realm,
        nameKey,
        kind,
      ) as ItemRow | undefined) ?? null
    );
  }
  return (
    (cachedStatement(db, `SELECT * FROM item WHERE realm = ? AND name_key = ? ORDER BY id LIMIT 1`).get(
      realm,
      nameKey,
    ) as ItemRow | undefined) ?? null
  );
}

export function findItemByKindName(db: Db, kind: string, name: string, realm = 'ru'): ItemRow | null {
  const n = norm(name);
  return (
    (cachedStatement(
      db,
      `SELECT * FROM item WHERE realm = ? AND kind = ? AND name_norm = ?
         ORDER BY (base_item_id IS NOT NULL) ASC, id ASC LIMIT 1`,
    ).get(realm, kind, n) as ItemRow | undefined) ?? null
  );
}

export interface SearchOptions {
  q?: string | null;
  kind?: string | null;
  rank?: string | null;
  slot?: string | null;
  limit?: number;
  realm?: string;
}

export function searchItems(db: Db, opts: SearchOptions = {}): ItemRow[] {
  const where: string[] = ['realm = @realm'];
  const params: Record<string, unknown> = { realm: opts.realm ?? 'ru', limit: opts.limit ?? 20 };
  if (opts.kind) {
    where.push('kind = @kind');
    params.kind = opts.kind;
  }
  if (opts.rank) {
    // The catalog stores `RANK_MASTER`; the payload and the filter options use `master`.
    where.push('(LOWER(rank) = LOWER(@rank) OR LOWER(rank) = LOWER(@rank_label))');
    params.rank = opts.rank;
    params.rank_label = `RANK_${opts.rank}`;
  }
  if (opts.slot) {
    where.push('slot = @slot');
    params.slot = opts.slot;
  }
  const query = opts.q ? norm(opts.q) : '';
  const tokens = query ? query.split(' ').filter(Boolean) : [];
  for (const [index, token] of tokens.entries()) {
    // Each word may land in a different column: "assault rifle" is a category phrase.
    params[`token${index}`] = `%${token}%`;
    where.push(
      `(name_norm LIKE @token${index} OR name_en_norm LIKE @token${index} OR category LIKE @token${index})`,
    );
  }
  if (tokens.length) {
    params.exact = query;
    params.prefix = `${query}%`;
  }
  const order = tokens.length
    ? `CASE
        WHEN name_norm = @exact THEN 0
        WHEN name_norm LIKE @prefix THEN 1
        WHEN name_en_norm = @exact THEN 1
        WHEN name_en_norm LIKE @prefix THEN 2
        ELSE 3
      END, length(name_norm), name_norm`
    : `kind, name_norm`;
  return db
    .prepare(`SELECT * FROM item WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT @limit`)
    .all(params) as ItemRow[];
}

export function listItems(db: Db, kind?: string, realm = 'ru'): ItemRow[] {
  if (kind) {
    return db.prepare(`SELECT * FROM item WHERE realm = ? AND kind = ? ORDER BY name_norm`).all(realm, kind) as ItemRow[];
  }
  return db.prepare(`SELECT * FROM item WHERE realm = ? ORDER BY kind, name_norm`).all(realm) as ItemRow[];
}

/**
 * The rows the page payload needs: catalog weapons/armor, device-category rows and the items
 * an owned instance points at. Other catalog kinds stay out so the read does not scan them.
 */
export function listPayloadItems(db: Db, ownedIds: readonly number[]): ItemRow[] {
  const ownedClause = ownedIds.length ? ` OR id IN (${placeholders(ownedIds.length)})` : '';
  return db
    .prepare(
      `SELECT * FROM item
        WHERE realm = 'ru'
          AND (kind IN ('weapon', 'armor')
            OR category = 'device'
            OR category LIKE 'device/%'
            OR category LIKE '%/device'
            OR category LIKE '%/device/%'${ownedClause})
        ORDER BY kind, name_norm`,
    )
    .all(...ownedIds) as ItemRow[];
}

export function itemStats(db: Db, itemId: number, level?: number): ItemStatRow[] {
  const rows =
    level == null
      ? cachedStatement(db, `SELECT * FROM item_stat WHERE item_id = ? ORDER BY stat_id, level, is_additional`).all(
          itemId,
        )
      : cachedStatement(
          db,
          `SELECT * FROM item_stat WHERE item_id = ? AND level = ? ORDER BY stat_id, is_additional`,
        ).all(itemId, level);
  return rows as ItemStatRow[];
}

export function statValue(db: Db, itemId: number, key: string, level = 0): number | null {
  const row = cachedStatement(
    db,
    `SELECT value_num FROM item_stat WHERE item_id = ? AND stat_id = ? AND level = ? ORDER BY is_additional LIMIT 1`,
  ).get(itemId, key, level) as { value_num: number | null } | undefined;
  return row?.value_num ?? null;
}

/**
 * Exact level when the source has it, otherwise the level-0 value. Some sources store a
 * container stat once, unscaled, so a refined instance must still see it.
 */
export function statValueBase(db: Db, itemId: number, key: string, level: number): number | null {
  return statValue(db, itemId, key, level) ?? statValue(db, itemId, key, 0);
}

/** Batch-friendly `statValueBase` over rows already loaded for the item. */
export function statValueBaseFrom(rows: ItemStatRow[], key: string, level: number): number | null {
  const exact = rows.find((row) => row.stat_id === key && row.level === level);
  if (exact) return exact.value_num ?? null;
  return rows.find((row) => row.stat_id === key && row.level === 0)?.value_num ?? null;
}

export function countItems(db: Db, kind?: string): number {
  const row = kind
    ? (db.prepare(`SELECT COUNT(*) AS c FROM item WHERE kind = ?`).get(kind) as { c: number })
    : (db.prepare(`SELECT COUNT(*) AS c FROM item`).get() as { c: number });
  return row.c;
}

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

export function itemsByIds(db: Db, ids: number[]): Map<number, ItemRow> {
  const out = new Map<number, ItemRow>();
  if (!ids.length) return out;
  const rows = db
    .prepare(`SELECT * FROM item WHERE id IN (${placeholders(ids.length)})`)
    .all(...ids) as ItemRow[];
  for (const row of rows) out.set(row.id, row);
  return out;
}

export function statsByItemIds(
  db: Db,
  ids: number[],
  levels?: readonly number[],
  statIds?: readonly string[],
): Map<number, ItemStatRow[]> {
  const out = new Map<number, ItemStatRow[]>();
  if (!ids.length) return out;
  if (levels && !levels.length) return out;
  if (statIds && !statIds.length) return out;
  const levelClause = levels ? ` AND level IN (${placeholders(levels.length)})` : '';
  const statClause = statIds ? ` AND stat_id IN (${placeholders(statIds.length)})` : '';
  const rows = db
    .prepare(
      `SELECT item_id, stat_id, label, level, value_num, value_min, value_max, value_text, pct,
              is_positive, is_additional, source_id
         FROM item_stat WHERE item_id IN (${placeholders(ids.length)})${levelClause}${statClause}
        ORDER BY item_id, stat_id, level, is_additional`,
    )
    .all(...ids, ...(levels ?? []), ...(statIds ?? [])) as ItemStatRow[];
  for (const row of rows) {
    const list = out.get(row.item_id) ?? [];
    list.push(row);
    out.set(row.item_id, list);
  }
  return out;
}
