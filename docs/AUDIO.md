# Audio assets

The site's radio bar (`ZONE FM`) plays three ambient tracks. Every file is a recording by
**Tsorthan Grove**, released under **CC0 1.0**, and stored in `public/audio/zone-fm/`.

No STALKER, Metro or other game audio, ambience or sample is used. The tracks are generic
post-apocalyptic ambient music from a public CC0 entry, not game assets.

## Source and license

- Source page: <https://opengameart.org/content/the-world-fell-silent>
- Author: Tsorthan Grove
- Accessed: 2026-11-17
- License: **CC0 1.0** (`CC0-1.0`). The page's copyright/attribution notice reads:
  “CC0 / Public Domain. No Rights Reserved. Free to use, no attribution required.”
- The page's license field and the notice agree, so no attribution is required. The player
  still credits the author in its track list.

## Files

| Output | Source loop | Duration | Size (bytes) | SHA-256 |
| --- | --- | --- | --- | --- |
| `public/audio/zone-fm/the-world-fell-silent.mp3` | `the_world_fell_silent_loop.flac` | 153.599524 s (2:34) | 2,458,479 | `36ada3f5c4dbb651f7b7418bcf7eb1fc8f9d1c819b18eb7d742739c96a07ddb6` |
| `public/audio/zone-fm/outpost.mp3` | `outpost_loop.flac` | 122.999002 s (2:03) | 1,969,049 | `53a6bb8cd21ae3f5315722efc86fe1d65bd27ea82cb0073c44a878badf59f711` |
| `public/audio/zone-fm/dirty-rain.mp3` | `dirty_rain_loop.flac` | 143.599048 s (2:24) | 2,298,819 | `256d3b9d33dfbf902062173d437616bbc6eb8ea752c210a87eaa741078a2fb1e` |

The `*_loop.flac` variants are used so the `<audio loop>` point is seamless apart from the
usual MP3 encoder padding, which the ambient material makes inaudible.

## How the files were produced

The source FLACs are not committed. Only the MP3s are, at 128 kbps, 44.1 kHz, stereo, with
metadata stripped. The exact commands:

```bash
curl -L --fail -o world.flac   https://opengameart.org/sites/default/files/the_world_fell_silent_loop.flac
curl -L --fail -o outpost.flac https://opengameart.org/sites/default/files/outpost_loop.flac
curl -L --fail -o rain.flac    https://opengameart.org/sites/default/files/dirty_rain_loop.flac

ffmpeg -y -i world.flac   -map_metadata -1 -codec:a libmp3lame -b:a 128k -ar 44100 -ac 2 public/audio/zone-fm/the-world-fell-silent.mp3
ffmpeg -y -i outpost.flac -map_metadata -1 -codec:a libmp3lame -b:a 128k -ar 44100 -ac 2 public/audio/zone-fm/outpost.mp3
ffmpeg -y -i rain.flac    -map_metadata -1 -codec:a libmp3lame -b:a 128k -ar 44100 -ac 2 public/audio/zone-fm/dirty-rain.mp3
```

Verify a file after replacing it:

```bash
ffprobe -v error -show_entries format=duration,size -of csv=p=0 public/audio/zone-fm/outpost.mp3
sha256sum public/audio/zone-fm/outpost.mp3
```

`tests/unit/app/radio/tracks.test.ts` checks that every manifest entry points at an existing
non-empty file, so a missing or truncated asset fails the test suite.

## Serving

The files are same-origin under `public/audio/` and stay behind the normal session: the
middleware in `server/middleware/auth.ts` is not bypassed for `/audio/*` and no public path
is added. `nuxt.config.ts` gives `/audio/**` a `cache-control: private, max-age=0,
must-revalidate` rule: the browser may cache a track for the session but revalidates it, and
a shared cache never stores the `302 /login` that an unauthenticated request receives.
