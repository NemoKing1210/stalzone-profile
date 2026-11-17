import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as core from '@profile/core';
import * as inventory from '@profile/core/modules/inventory';

describe('inventory public API', () => {
  it('exposes the read and write primitives', () => {
    expect(typeof inventory.inventoryRead).toBe('function');
    expect(typeof inventory.listPlacements).toBe('function');
    expect(typeof inventory.createInventoryItem).toBe('function');
  });

  it('does not import core repositories from the MCP client', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'packages/mcp/src/client.ts'), 'utf8');
    expect(source).not.toContain('@profile/core/repo');
    expect(source).not.toContain('@profile/core/db');
  });
});

describe('sync schedule public API', () => {
  it('exposes the schedule read but not the raw mutator on the facade', () => {
    expect(typeof core.readSyncSchedule).toBe('function');
    expect(Object.keys(core)).not.toContain('writeSyncScheduleRow');
  });
});
