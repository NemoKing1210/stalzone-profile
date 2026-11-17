export interface RadioTrack {
  readonly id: string;
  readonly title: string;
  readonly src: string;
  readonly author: string;
  readonly license: 'CC0-1.0';
  readonly source: string;
}

export const RADIO_TRACKS = [
  {
    id: 'the-world-fell-silent',
    title: 'The World Fell Silent',
    src: '/audio/zone-fm/the-world-fell-silent.mp3',
    author: 'Tsorthan Grove',
    license: 'CC0-1.0',
    source: 'https://opengameart.org/content/the-world-fell-silent',
  },
  {
    id: 'outpost',
    title: 'Outpost',
    src: '/audio/zone-fm/outpost.mp3',
    author: 'Tsorthan Grove',
    license: 'CC0-1.0',
    source: 'https://opengameart.org/content/the-world-fell-silent',
  },
  {
    id: 'dirty-rain',
    title: 'Dirty Rain',
    src: '/audio/zone-fm/dirty-rain.mp3',
    author: 'Tsorthan Grove',
    license: 'CC0-1.0',
    source: 'https://opengameart.org/content/the-world-fell-silent',
  },
] as const satisfies readonly RadioTrack[];
