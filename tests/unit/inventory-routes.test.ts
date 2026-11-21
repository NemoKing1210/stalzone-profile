import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const api = path.join(root, 'server', 'api', 'v1');

const NEW_ROUTES = [
  'inventory.get.ts',
  'inventory/items.post.ts',
  'inventory/items/[id].get.ts',
  'inventory/items/[id].patch.ts',
  'inventory/items/[id].delete.ts',
  'inventory/items/[id]/move.post.ts',
  'inventory/storages.post.ts',
  'inventory/storages/[id].patch.ts',
  'inventory/storages/[id].delete.ts',
  'inventory/storages/[id]/auto-arrange.post.ts',
  'inventory/containers/[id]/fill.put.ts',
  'inventory/weapons/[id]/modifications/[slot].put.ts',
  'items/[id]/layout.patch.ts',
];

const REMOVED_ROUTES = [
  'owned.get.ts',
  'owned.post.ts',
  'owned/[id].patch.ts',
  'owned/[id].delete.ts',
  'containers/[id]/fill.put.ts',
];

describe('inventory REST routes', () => {
  it('registers every new inventory route', () => {
    for (const route of NEW_ROUTES) {
      expect(fs.existsSync(path.join(api, route)), route).toBe(true);
    }
  });

  it('removes the legacy owned and fill routes', () => {
    for (const route of REMOVED_ROUTES) {
      expect(fs.existsSync(path.join(api, route)), route).toBe(false);
    }
  });
});
