import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES } from '../../app/utils/apiErrorMessage';

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

  it('names the exact counts in the clear-all confirmation', () => {
    expect(params(en['settings.cleanup.confirmAll']!)).toEqual(['copies', 'count', 'records']);
  });

  it('names the cleanup actions in the journal', () => {
    for (const key of [
      'events.actions.ownedClear',
      'events.actions.buildClear',
      'events.actions.dossierClear',
      'events.actions.characterCreate',
    ]) {
      expect(en[key]).toBeTruthy();
      expect(en[key]).not.toBe(key);
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
