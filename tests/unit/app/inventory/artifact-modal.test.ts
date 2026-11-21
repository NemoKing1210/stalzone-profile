import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The artifact card opened from a container used to live inside the container's own
 * `UModal`. Closing the container unmounts that modal body, taking the nested artifact
 * modal with it, so the artifact never appeared. The card now lives at the modal host
 * level; this test pins the structure that keeps the lifecycle correct without a browser
 * harness.
 */
const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), 'app', file), 'utf8');

describe('container artifact modal', () => {
  it('leaves the artifact modal to the host and only emits the target from the item panel', () => {
    const panel = read('features/inventory/ui/ItemDetailsModal.vue');
    const host = read('features/inventory/ui/ItemModalHost.vue');

    expect(panel).toContain("emit('artifact'");
    expect(host).toContain('artifactTarget');
    expect(host).toContain('@artifact="openArtifact"');
  });
});
