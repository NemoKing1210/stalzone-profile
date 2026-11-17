import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RADIO_TRACKS } from '~/features/radio/model/tracks';

describe('radio tracks', () => {
  it('ships exactly three tracks with the expected ids', () => {
    expect(RADIO_TRACKS).toHaveLength(3);
    expect(new Set(RADIO_TRACKS.map((track) => track.id)).size).toBe(3);
    expect(new Set(RADIO_TRACKS.map((track) => track.src)).size).toBe(3);
    expect(RADIO_TRACKS.map((track) => track.id)).toEqual([
      'the-world-fell-silent',
      'outpost',
      'dirty-rain',
    ]);
  });

  it('points every track at a local mp3 and records its CC0 source', () => {
    for (const track of RADIO_TRACKS) {
      expect(track.src).toMatch(/^\/audio\/zone-fm\/[a-z0-9-]+\.mp3$/);
      expect(track.license).toBe('CC0-1.0');
      expect(track.source).toMatch(/^https:\/\/opengameart\.org\/content\//);
      expect(track.author).toBe('Tsorthan Grove');
      expect(track.title.length).toBeGreaterThan(0);
    }
  });

  it('ships every audio file in the repository', () => {
    for (const track of RADIO_TRACKS) {
      const file = path.join(process.cwd(), 'public', track.src.replace(/^\//, ''));
      expect(fs.existsSync(file), file).toBe(true);
      expect(fs.statSync(file).size, file).toBeGreaterThan(100_000);
    }
  });
});
