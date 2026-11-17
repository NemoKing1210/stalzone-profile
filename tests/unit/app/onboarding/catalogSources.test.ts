import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATALOG_SOURCES,
  catalogProgress,
  catalogSources,
  isSourceReady,
} from '~/features/onboarding/model/catalogSources';

describe('catalog sources', () => {
  it('orders sources the way the catalog is built and marks the important ones', () => {
    expect(CATALOG_SOURCES.map((source) => source.id)).toEqual(['exbo_base', 'wiki', 'motifs', 'scpmodel', 'icons']);
    expect(CATALOG_SOURCES.filter((source) => source.level === 'required').map((source) => source.id)).toEqual([
      'exbo_base',
    ]);
    expect(CATALOG_SOURCES.filter((source) => source.level === 'recommended').map((source) => source.id)).toEqual([
      'wiki',
      'scpmodel',
    ]);
  });

  it('shows only the sources the server knows about, keeping catalog order', () => {
    expect(catalogSources(['icons', 'exbo_base']).map((source) => source.id)).toEqual(['exbo_base', 'icons']);
    expect(catalogSources([])).toEqual([]);
  });

  it('counts a source as ready from a fresh stored copy or a successful run', () => {
    expect(isSourceReady('ok')).toBe(true);
    expect(isSourceReady('stale')).toBe(false);
    expect(isSourceReady('stale', { status: 'ok' })).toBe(true);
    expect(isSourceReady('ok', { status: 'stale' })).toBe(false);
    expect(isSourceReady('never', { status: 'running' })).toBe(false);
  });

  it('counts ready sources and never divides by zero', () => {
    const sources = catalogSources(['exbo_base', 'wiki']);
    expect(catalogProgress(sources, () => false)).toEqual({ done: 0, total: 2, percent: 0 });
    expect(catalogProgress(sources, (id) => id === 'wiki')).toEqual({ done: 1, total: 2, percent: 50 });
    expect(catalogProgress([], () => false)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it('has a description and badge text for every source in both catalogs', () => {
    for (const locale of ['en', 'ru']) {
      const catalog = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'i18n', 'locales', `${locale}.json`), 'utf8'));
      for (const source of CATALOG_SOURCES) {
        expect(catalog.setup.sourceInfo[source.id], `${locale}: setup.sourceInfo.${source.id}`).toBeTruthy();
      }
      expect(catalog.setup.required, `${locale}: setup.required`).toBeTruthy();
      expect(catalog.setup.recommended, `${locale}: setup.recommended`).toBeTruthy();
    }
  });
});
