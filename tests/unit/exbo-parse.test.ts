import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseExboItem } from '@profile/sources';

const fixture = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'exbo-item.json'), 'utf8'),
) as Record<string, unknown>;

describe('EXBO item parser', () => {
  it('preserves the EXBO name key and collects suitable-for item keys', () => {
    const labels: Record<string, string> = {};
    const item = parseExboItem(fixture, labels);

    expect(item.nameKey).toBe('item.wpn.gauss.name');
    expect(item.compatibleKeys).toContain('item.wpn.gauss.name');
    expect(item.compatibleKeys).toContain('item.wpn.ak12.name');
  });

  it('keeps the translated text and stats the legacy parser produced', () => {
    const item = parseExboItem(fixture);

    expect(item.ru).toBe('Прицел «Гаусс»');
    expect(item.en).toBe('Gauss scope');
    expect(item.cat).toBe('attachment/scope');
    expect(item.st['scope.zoom']).toBe(4);
  });
});
