import fs from 'node:fs';
import path from 'node:path';
import { baseCompile } from '@intlify/message-compiler';
import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES } from '../../app/shared/lib/apiErrorMessage';

type Catalog = Record<string, unknown>;

function readCatalog(locale: string): Catalog {
  const file = path.join(process.cwd(), 'i18n', 'locales', `${locale}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog;
}

function flatten(value: Catalog, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [key, entry] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flatten(entry as Catalog, full, out);
    } else {
      out[full] = String(entry);
    }
  }
  return out;
}

function params(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}

describe('i18n catalogs', () => {
  const en = flatten(readCatalog('en'));
  const ru = flatten(readCatalog('ru'));

  it('has the same key set in both locales', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it('uses the same interpolation params for every key', () => {
    for (const key of Object.keys(en)) {
      expect({ key, params: params(en[key]!) }).toEqual({ key, params: params(ru[key] ?? '') });
    }
  });

  it('compiles every message with the same compiler the build uses', () => {
    for (const [locale, catalog] of [
      ['en', en],
      ['ru', ru],
    ] as const) {
      for (const [key, message] of Object.entries(catalog)) {
        const errors: string[] = [];
        baseCompile(message, { onError: (error) => errors.push(error.message) });
        expect(errors, `${locale} ${key}: ${message}`).toEqual([]);
      }
    }
  });

  it('has no instructional copy for self-evident interactions', () => {
    for (const key of [
      'weapons.hint',
      'armor.hint',
      'artifacts.hint',
      'inventory.menuHint',
      'inventory.resizeHint',
      'forms.layoutHint',
    ]) {
      expect(en[key], key).toBeUndefined();
      expect(ru[key], key).toBeUndefined();
    }
    for (const key of ['inventory.overflowHint', 'inventory.fixedSizeHint', 'inventory.compatHint']) {
      expect(en[key], key).toBeTruthy();
      expect(ru[key], key).toBeTruthy();
    }
  });

  it('contains the base keys the shell depends on', () => {
    for (const key of ['common.language', 'nav.weapons', 'errors.UNAUTHORIZED']) {
      expect(en[key]).toBeTruthy();
      expect(ru[key]).toBeTruthy();
    }
  });

  it('registers every catalog error code in the UI allow-list', () => {
    const codes = Object.keys(en)
      .filter((key) => key.startsWith('errors.') && key !== 'errors.generic')
      .map((key) => key.slice('errors.'.length));
    for (const code of codes) expect(API_ERROR_CODES.has(code), code).toBe(true);
  });

  it('names the exact counts in the inventory confirmation', () => {
    expect(params(en['settings.cleanup.confirmInventory']!)).toEqual(['copies', 'records']);
  });

  it('names the cleanup actions in the journal', () => {
    for (const key of [
      'events.actions.ownedClear',
      'events.actions.profileClear',
      'events.actions.characterCreate',
      'events.actions.characterStatsClear',
      'events.actions.characterDelete',
      'events.actions.journalClear',
      'events.actions.resetAll',
    ]) {
      expect(en[key]).toBeTruthy();
      expect(en[key]).not.toBe(key);
    }
  });

  it('has the reset panel copy in both locales', () => {
    for (const key of [
      'settings.cleanup.intro',
      'settings.cleanup.manualStatsTitle',
      'settings.cleanup.characterTitle',
      'settings.cleanup.journalTitle',
      'settings.cleanup.allTitle',
      'settings.cleanup.confirmManualStats',
      'settings.cleanup.confirmCharacter',
      'settings.cleanup.confirmJournal',
      'settings.cleanup.confirmAll',
      'settings.cleanup.requireWord',
    ]) {
      expect(en[key], key).toBeTruthy();
      expect(ru[key], key).toBeTruthy();
    }
  });

  it('has the setup wizard copy in both locales', () => {
    for (const key of [
      'setup.title',
      'setup.create',
      'setup.catalogIntro',
      'setup.skipCatalog',
      'setup.profileSettings',
      'setup.finish',
      'setup.step',
    ]) {
      expect(en[key], key).toBeTruthy();
      expect(ru[key], key).toBeTruthy();
    }
  });

  it('has the add-owned and catalog-notice copy in both locales', () => {
    for (const key of [
      'owned.addTitle',
      'owned.item',
      'owned.add',
      'owned.catalogRequired',
      'catalogNotice.title',
      'catalogNotice.action',
    ]) {
      expect(en[key], key).toBeTruthy();
      expect(ru[key], key).toBeTruthy();
    }
  });

  it('registers the new API error codes', () => {
    for (const code of ['CHARACTER_EXISTS', 'CHARACTER_NOT_EMPTY', 'STALZONE_API_NOT_CONFIGURED']) {
      expect(API_ERROR_CODES.has(code), code).toBe(true);
    }
  });

  it('names the achievement counter as a count, not points', () => {
    expect(en['forms.stat.ach-gai']).toMatch(/achievement/i);
    expect(en['forms.stat.ach-gai']).not.toMatch(/points/i);
    expect(ru['forms.stat.ach-gai']).toMatch(/достижен/i);
  });

  it('gives every rank a name instead of a missing-value label', () => {
    for (const rank of ['default', 'newbie', 'stalker', 'veteran', 'master', 'legend']) {
      expect(en[`ranks.${rank}`]).not.toMatch(/^(no|none|—)/i);
      expect(ru[`ranks.${rank}`]).not.toMatch(/^(нет|—)/i);
    }
  });
});
