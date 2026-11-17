import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('favicon', () => {
  it('ships a multi-size 32-bit icon at the public path', () => {
    const file = path.join(root, 'public', 'favicon.ico');
    expect(fs.existsSync(file), file).toBe(true);
    const buf = fs.readFileSync(file);

    expect(buf.readUInt16LE(0)).toBe(0); // reserved
    expect(buf.readUInt16LE(2)).toBe(1); // resource type: icon
    const count = buf.readUInt16LE(4);
    expect(count).toBe(3);

    const sizes: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const entry = 6 + index * 16;
      const width = buf[entry] === 0 ? 256 : buf[entry];
      const height = buf[entry + 1] === 0 ? 256 : buf[entry + 1];
      const bytes = buf.readUInt32LE(entry + 8);
      const offset = buf.readUInt32LE(entry + 12);

      expect(height, `entry ${index} height`).toBe(width);
      expect(buf.readUInt16LE(entry + 4), `entry ${index} planes`).toBe(1);
      expect(buf.readUInt16LE(entry + 6), `entry ${index} bit depth`).toBe(32);
      expect(offset + bytes, `entry ${index} bounds`).toBeLessThanOrEqual(buf.length);
      // Every image is a BITMAPINFOHEADER whose height covers the XOR bitmap and the AND mask.
      expect(buf.readUInt32LE(offset), `entry ${index} header`).toBe(40);
      expect(buf.readInt32LE(offset + 4), `entry ${index} bitmap width`).toBe(width);
      expect(buf.readInt32LE(offset + 8), `entry ${index} bitmap height`).toBe(height * 2);
      sizes.push(width);
    }

    expect(sizes).toEqual([16, 32, 48]);
  });

  it('is declared in the document head and stays publicly reachable', () => {
    const config = fs.readFileSync(path.join(root, 'nuxt.config.ts'), 'utf8');
    expect(config).toContain("href: '/favicon.ico'");

    const middleware = fs.readFileSync(path.join(root, 'server', 'middleware', 'auth.ts'), 'utf8');
    expect(middleware).toContain("path === '/favicon.ico'");
  });
});
