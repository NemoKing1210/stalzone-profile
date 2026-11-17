import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * The app boundary rules are configuration, so unit tests exercise them the way a
 * developer would: lint a probe import and assert the verdict. These probes fail
 * loudly if a future edit to `eslint.config.mjs` widens a layer or forgets a package.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function lintProbe(filePath: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath, warnIgnored: false });
  return result.messages.filter((message) => message.severity === 2).map((message) => message.ruleId ?? 'unknown');
}

describe('app boundaries', () => {
  it.each([
    [
      'a feature importing another feature',
      'app/features/inventory/probe.ts',
      "import { LoginPage } from '~/features/auth';",
    ],
    ['shared importing a feature', 'app/shared/probe.ts', "import { LoginPage } from '~/features/auth';"],
    ['an entity importing a feature', 'app/entities/item/probe.ts', "import { LoginPage } from '~/features/auth';"],
  ])('rejects %s', async (_label, filePath, source) => {
    expect(await lintProbe(filePath, source)).toContain('boundaries/dependencies');
  });

  it.each([
    ['@dossier/core', "import { buildPayload } from '@dossier/core';"],
    ['@dossier/mcp', "import { localClient } from '@dossier/mcp';"],
    ['@dossier/sources', "import { exboAdapter } from '@dossier/sources';"],
    ['the shared barrel', "import { rankKey } from '@dossier/shared';"],
    ['a non-client shared subpath', "import { sha1 } from '@dossier/shared/hash';"],
  ])('rejects %s in the app', async (_label, source) => {
    expect(await lintProbe('app/shared/probe.ts', source)).toContain('no-restricted-imports');
  });

  it.each([
    ['contracts', "import { OwnedPatchSchema } from '@dossier/shared/contracts';"],
    ['ranks', "import { rankKey } from '@dossier/shared/ranks';"],
    ['format', "import { g1 } from '@dossier/shared/format';"],
  ])('allows @dossier/shared/%s', async (_label, source) => {
    expect(await lintProbe('app/features/inventory/probe.ts', source)).toEqual([]);
  });

  it('allows a feature to import shared, entities and its own files', async () => {
    const messages = await lintProbe(
      'app/features/inventory/probe.ts',
      "import { rankTextColor } from '~/shared/lib/rankText';\nimport { ItemCard } from '~/entities/item';",
    );
    expect(messages).toEqual([]);
  });
});
