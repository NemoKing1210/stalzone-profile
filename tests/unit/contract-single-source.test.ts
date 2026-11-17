import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** `@profile/shared/contracts` owns the shapes the app, core and API exchange. */
const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('contract single source', () => {
  it.each(['packages/core/src/platform/journal/index.ts', 'app/shared/composables/useWrite.ts'])(
    '%s takes WriteResult from the contracts instead of redeclaring it',
    (file) => {
      const source = read(file);
      expect(source).toContain("from '@profile/shared/contracts'");
      expect(source).not.toMatch(/interface WriteResult\b/);
      expect(source).not.toMatch(/interface WriteDiff\b/);
    },
  );

  it('takes the freshness block from the contracts instead of redeclaring it', () => {
    const source = read('app/shared/types/profile.ts');
    expect(source).toContain("from '@profile/shared/contracts'");
    expect(source).not.toMatch(/interface ProfileFreshness\b/);
  });

  it('takes the owned kind and event row from the contracts instead of redeclaring them', () => {
    const source = read('app/shared/types/profile.ts');
    expect(source).not.toMatch(/export type OwnedKind =/);
    expect(source).not.toMatch(/export interface EventRow\b/);
  });

  it('takes the meta header from the contracts instead of redeclaring it', () => {
    expect(read('app/shared/composables/useProfile.ts')).toContain(
      "import type { MetaRead } from '@profile/shared/contracts'",
    );
    expect(read('app/shared/types/profile.ts')).not.toMatch(/interface ProfileMetaResponse\b/);
  });
});
