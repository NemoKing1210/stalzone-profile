import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The artifact card opened from a container used to live inside the container's own
 * `UModal`. Closing the container unmounts that modal body, taking the nested artifact
 * modal with it, so the artifact never appeared. The card now lives at the screen level;
 * this test pins the structure that keeps the lifecycle correct without a browser harness.
 */
const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), 'app', file), 'utf8');

describe('container artifact modal', () => {
  it('leaves the artifact modal to the screen and only emits the target from the detail panel', () => {
    const panel = read('features/inventory/ui/kinds/ContainerDetailPanel.vue');
    const screen = read('features/inventory/ui/InventoryScreen.vue');

    expect(panel).not.toContain('<UModal');
    expect(panel).toContain("emit('artifact'");
    expect(screen).toContain('artifactTarget');
    expect(screen).toContain('@artifact="openArtifact"');
  });
});
