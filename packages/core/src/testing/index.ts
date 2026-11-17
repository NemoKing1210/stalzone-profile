/**
 * Seeding surface for tests and fixtures. It re-exports the write primitives
 * that fixtures need, without the journal, so a seeded database has no events.
 * Not for application code.
 */
export {
  addItemStats,
  ensureStatDefinition,
  insertPriceQuote,
  replaceItemEffects,
  replaceItemStats,
  upsertIcon,
  upsertItem,
  upsertStatDefinition,
} from '../modules/catalog/index.js';
export {
  clearCharacterStat,
  getCharacter,
  setCharacterStat,
  upsertCharacter,
} from '../modules/identity/index.js';
/* New-model inventory seed surface. Fixtures write through the repositories, not the journal. */
export {
  deleteInventoryItemRow,
  deletePlacement,
  deleteStorageRow,
  getContainerData,
  getInventoryItem,
  getInventoryStorage,
  getItemLayout,
  getPlacement,
  getStorage,
  insertInventoryItem,
  insertStorage,
  listCompatForAttachment,
  listInventoryItems,
  listPlacements,
  listStoragePlacements,
  listStorages,
  replaceExboCompat,
  upsertContainerData,
  upsertItemLayout,
  upsertPlacement,
} from '../modules/inventory/index.js';
export { ensureDefaultSources, ensureSource, markSourceOk } from '../modules/sync/index.js';
