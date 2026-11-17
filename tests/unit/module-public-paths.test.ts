import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as inventory from '@dossier/core/modules/inventory';
import * as builds from '@dossier/core/modules/builds';

describe('inventory and builds public APIs', () => {
  it('exposes the read and write primitives', () => {
    expect(typeof inventory.listOwned).toBe('function');
    expect(typeof inventory.allContainerSlots).toBe('function');
    expect(typeof builds.listBuilds).toBe('function');
    expect(typeof builds.saveBuild).toBe('function');
  });

  it('does not import core repositories from the MCP client', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'packages/mcp/src/client.ts'), 'utf8');
    expect(source).not.toContain('@dossier/core/repo');
    expect(source).not.toContain('@dossier/core/db');
  });
});
