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
export { clearCharacterStat, setCharacterStat, upsertCharacter } from '../modules/identity/index.js';
export { replaceContainerSlots, upsertOwned, upsertOwnedContainer } from '../modules/inventory/index.js';
export { ensureDefaultSources, ensureSource, markSourceOk } from '../modules/sync/index.js';

/** Raw owned delete without the write service's options and journal entry. */
export { deleteOwned as deleteOwnedRow } from '../modules/inventory/repo/owned.js';
