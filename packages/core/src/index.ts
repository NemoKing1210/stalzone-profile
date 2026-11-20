/**
 * Application façade of `@profile/core`. HTTP routes, MCP and scripts use this
 * surface; repositories and module internals stay behind module indexes, and the
 * raw mutators that write without a journal entry are not re-exported here.
 */
export * from './platform/config.js';
export * from './platform/db/index.js';
export * from './platform/db/migrate.js';
export * from './platform/journal/index.js';
export * from './platform/logging/index.js';
export * from './platform/security.js';

/* ------------------------------- catalog ------------------------------- */

export * from './modules/catalog/calc/index.js';
export * from './modules/catalog/service/catalog-view.js';
export * from './modules/catalog/service/read.js';
export * from './modules/catalog/service/resolve.js';
export type { ItemEffectInput, ItemEffectRow } from './modules/catalog/repo/effects.js';
export { allItemEffects, listItemEffects } from './modules/catalog/repo/effects.js';
export type { IconInput, IconRow } from './modules/catalog/repo/icons.js';
export { getIcon, iconMap, iconsByItemIds } from './modules/catalog/repo/icons.js';
export type { ItemInput, ItemRow, ItemStatRow, SearchOptions, StatInput } from './modules/catalog/repo/items.js';
export {
  countItems,
  findItemByKindName,
  getItemByExternalId,
  getItemById,
  isCosmeticCategory,
  itemStats,
  itemsByIds,
  kindFromCategory,
  listItems,
  searchItems,
  statValue,
  statsByItemIds,
} from './modules/catalog/repo/items.js';
export type { PriceQuoteInput, PriceRow, PriceRowsByName } from './modules/catalog/repo/prices.js';
export {
  bestPrice,
  countPrices,
  effectivePrice,
  latestPriceFetchedAt,
  latestPriceRows,
  latestPricesForNames,
} from './modules/catalog/repo/prices.js';
export type { StatDefinitionInput, StatDefinitionRow, StatValueType } from './modules/catalog/repo/stats.js';
export { getStatDefinition, listStatDefinitions } from './modules/catalog/repo/stats.js';

/* ------------------------------- identity ------------------------------ */

export * from './modules/identity/service/character-stats.js';
export * from './modules/identity/service/read.js';
export type { CharacterSnapshot } from './modules/identity/write.js';
export { characterOrThrow, characterSnapshot, createCharacter, patchCharacter } from './modules/identity/write.js';
export type {
  CharacterColumnPatch,
  CharacterInput,
  CharacterRegion,
  CharacterRow,
  CharacterStat,
  CharacterStatOrigin,
  CharacterStatRow,
} from './modules/identity/repo/characters.js';
export {
  characterStatMap,
  findCharacterByName,
  getCharacter,
  listCharacterStats,
  listCharacters,
} from './modules/identity/repo/characters.js';

/* ------------------------------ inventory ------------------------------ */

export * from './modules/inventory/service/inventory-read.js';
export {
  autoArrangeStorage,
  createInventoryItem,
  createStorage,
  deleteInventoryItem,
  deleteStorage,
  moveInventoryItem,
  setContainerFill,
  setItemLayout,
  setWeaponModule,
  tidyStorage,
  updateInventoryItem,
  updateStorage,
} from './modules/inventory/write/index.js';
export { getItemLayout } from './modules/inventory/repo/layout.js';

/* --------------------------------- sync -------------------------------- */

export * from './modules/sync/service/normalize.js';
export * from './modules/sync/service/profile.js';
export * from './modules/sync/service/read.js';
export * from './modules/sync/service/sync.js';
export * from './modules/sync/service/schedule.js';
export * from './modules/sync/service/diagnostics.js';
export * from './modules/sync/service/lock.js';
export * from './modules/sync/write.js';
export type { ScheduleRow } from './modules/sync/repo/schedule.js';
export { DEFAULT_SYNC_VALUES, getScheduleRow, readSyncSchedule } from './modules/sync/repo/schedule.js';
export type { SourceId, SourceOkMeta, SourceRow, SourceStatus } from './modules/sync/repo/sources.js';
export { ensureDefaultSources, getSource, listSources, SOURCE_IDS } from './modules/sync/repo/sources.js';

/* --------------------------- application modules ----------------------- */

export * from './modules/logging/index.js';
export * from './modules/setup/index.js';
export * from './modules/maintenance/index.js';
export * from './modules/read-model/index.js';
