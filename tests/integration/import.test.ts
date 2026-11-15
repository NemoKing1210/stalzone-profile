import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, loadConfig, migrate, openDb, type Db } from '@dossier/core';
import { findItemByKindName, getIcon } from '@dossier/core/repo';
import { importLegacy, type ImportReport } from '@dossier/core/services/import';
import { exportLegacyJson } from '@dossier/core/services/export';
import { buildPayload } from '@dossier/core/services/payload';

let dir: string;
let db: Db;
let first: ImportReport;
let second: ImportReport;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dossier-import-'));
  const cfg = loadConfig({
    dbPath: path.join(dir, 'test.db'),
    seedsDir: path.join(process.cwd(), 'db', 'seeds'),
    iconsDir: path.join(dir, 'icons'),
  });
  db = openDb(cfg.dbPath);
  migrate(db, cfg.migrationsDir);
  first = importLegacy(db, cfg);
  second = importLegacy(db, cfg);
});

afterAll(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('legacy import', () => {
  it('reports the seed totals', () => {
    expect(first).toMatchObject({
      ownedRows: 69,
      ownedCopies: 72,
      builds: 5,
      catalog: 495,
      details: 601,
      skipped: [],
    });
    expect(first.prices).toBeGreaterThan(0);
    expect(first.icons).toBe(99);
  });

  it('writes webp files and points items at the local icon', () => {
    const icon = getIcon(db, 'w:KS-1');
    expect(icon?.path).toMatch(/^\/icons\/[a-f0-9]{40}\.webp$/);
    const file = path.join(dir, 'icons', path.basename(icon!.path));
    expect(fs.existsSync(file)).toBe(true);
    const bytes = fs.readFileSync(file);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');

    expect(findItemByKindName(db, 'weapon', 'KS-1')?.icon_path).toBe(icon!.path);
    expect(findItemByKindName(db, 'artifact', 'Нервяк')?.icon_path).toMatch(/^\/icons\/[a-f0-9]{40}\.webp$/);
    expect(findItemByKindName(db, 'container', 'Контейнер «Бочонок»')?.icon_path).toMatch(
      /^\/icons\/[a-f0-9]{40}\.webp$/,
    );
  });

  it('is idempotent', () => {
    expect(second.ownedRows).toBe(first.ownedRows);
    expect(second.ownedCopies).toBe(first.ownedCopies);
    expect(second.details).toBe(601);
    expect(second.catalog).toBe(495);
    expect(second.items).toBe(first.items);
    expect(second.skipped).toEqual(['prices:already-imported']);
  });

  it('keeps legacy keys and values on owned rows', () => {
    const rows = db.prepare(`SELECT kind, display_name, qty, extra FROM owned`).all() as {
      kind: string;
      display_name: string | null;
      qty: number;
      extra: string;
    }[];
    expect(rows.every((row) => row.display_name)).toBe(true);
    const weapons = rows.filter((row) => row.kind === 'weapon');
    expect(weapons).toHaveLength(34);
    const withLegacy = weapons.filter((row) => JSON.parse(row.extra)?.legacy);
    expect(withLegacy.length).toBe(34);
  });
});

describe('dossier payload after import', () => {
  it('returns the legacy counts with copies expanded', () => {
    const payload = buildPayload(db);
    expect(payload.weapons).toHaveLength(35);
    expect(payload.armor).toHaveLength(12);
    expect(payload.containers).toHaveLength(3);
    expect(payload.artifacts).toHaveLength(22);
    expect(payload.builds.items).toHaveLength(5);
    expect(Object.keys(payload.details)).toHaveLength(601);
    expect(payload.catalog.weapons).toHaveLength(356);
    expect(payload.catalog.armor).toHaveLength(139);
  });

  it('expands identical copies in display order', () => {
    const payload = buildPayload(db);
    expect(payload.weapons.filter((w: { name: string }) => w.name === 'Winchester M70')).toHaveLength(2);
    expect(payload.artifacts.filter((a: { name: string }) => a.name === 'Нервяк')).toHaveLength(3);
  });

  it('uses display names from the dossier', () => {
    const payload = buildPayload(db);
    expect(payload.artifacts.some((a: { name: string }) => a.name === 'Нервяк')).toBe(true);
    expect(Object.keys(payload.details)).toContain('art:Нервяк');
  });
});

describe('legacy export', () => {
  it('round-trips the dossier shape and counts', () => {
    const json = exportLegacyJson(db);
    expect(json.weapons).toHaveLength(35);
    expect(json.armor).toHaveLength(12);
    expect(json.containers).toHaveLength(3);
    expect(json.artifacts).toHaveLength(22);
    expect(json.catalog.weapons).toHaveLength(356);
    expect(json.catalog.armor).toHaveLength(139);
    expect(Object.keys(json.details)).toHaveLength(601);
    expect(json.builds.items).toHaveLength(5);
    expect(json.character).toMatchObject({ nick: expect.any(String), realm: expect.any(String) });
    expect(json).not.toHaveProperty('icons');
    expect(json).not.toHaveProperty('freshness');
  });
});
