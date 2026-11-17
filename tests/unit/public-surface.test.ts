import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as core from '@dossier/core';
import * as testing from '@dossier/core/testing';

describe('core public surface', () => {
  it('exposes the application façade and testing seed surface', () => {
    expect(typeof core.buildPayload).toBe('function');
    expect(typeof core.createOwned).toBe('function');
    expect(typeof core.runSync).toBe('function');
    expect(typeof testing.upsertItem).toBe('function');
  });
  it('does not export repositories from the root', () => {
    const index = fs.readFileSync(path.join(process.cwd(), 'packages/core/src/index.ts'), 'utf8');
    expect(index).not.toContain("export * from './repo");
  });
  it.each([
    // Raw catalog writes bypass the journal; fixtures seed through @dossier/core/testing.
    'upsertItem',
    'replaceItemStats',
    'addItemStats',
    'replaceItemEffects',
    'upsertIcon',
    'insertPriceQuote',
    'upsertStatDefinition',
    // Raw dossier writes bypass the write services and event_log.
    'upsertCharacter',
    'setCharacterStat',
    'upsertOwned',
    'replaceContainerSlots',
    // Raw source bookkeeping belongs to the sync module.
    'ensureSource',
  ])('keeps the raw persistence primitive %s out of the root', (name) => {
    expect(core).not.toHaveProperty(name);
    expect(testing).toHaveProperty(name);
  });

  it.each(['restoreOwnedTx', 'restoreCharacterTx', 'deleteOwnedTx', 'clearOwnedTx', 'updateOwnedById'])(
    'keeps the transaction primitive %s internal to core',
    (name) => {
      expect(core).not.toHaveProperty(name);
      expect(testing).not.toHaveProperty(name);
    },
  );
});
