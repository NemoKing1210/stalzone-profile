import { describe, expect, it } from 'vitest';
import { iconFileMime } from '../../server/utils/icon-file';

describe('iconFileMime', () => {
  it('accepts sha1 png and webp names', () => {
    const sha = 'a'.repeat(40);
    expect(iconFileMime(`${sha}.png`)).toBe('image/png');
    expect(iconFileMime(`${sha}.webp`)).toBe('image/webp');
  });

  it('rejects traversal, short hashes, other extensions and upper case', () => {
    const sha = 'a'.repeat(40);
    for (const file of ['../x.png', 'abc.png', `${sha}.gif`, `${sha}.PNG`, `${'a'.repeat(41)}.png`]) {
      expect(iconFileMime(file), file).toBeNull();
    }
  });
});
