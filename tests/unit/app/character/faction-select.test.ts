import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = path.join(process.cwd(), 'app');
const read = (file: string): string => fs.readFileSync(path.join(appRoot, file), 'utf8');

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

describe('faction select and playstyle removal', () => {
  it('feeds the setup faction field from the shared faction options', () => {
    const setup = read('features/onboarding/ui/SetupPage.vue');
    expect(setup).toContain('factionItems');
    expect(setup).toContain('USelect');
    expect(setup).not.toContain('UInput v-model="form.faction"');
  });

  it('uses a select for the faction in the profile editor too', () => {
    const modal = read('features/character/ui/EditCharacterModal.vue');
    expect(modal).toMatch(/<USelect[\s\S]*?form\.faction/);
    expect(modal).not.toContain('create-item');
  });

  it('does not mention playstyle anywhere in the app', () => {
    const offenders = filesUnder(appRoot).filter((file) => fs.readFileSync(file, 'utf8').includes('playstyle'));
    expect(offenders.map((file) => path.relative(appRoot, file))).toEqual([]);
  });
});
