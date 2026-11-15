import fs from 'node:fs';
import path from 'node:path';

/** Serves imported `.webp` icons from `ICONS_DIR` (public/ served icons are baked at build). */
export default defineEventHandler((event) => {
  const file = String(getRouterParam(event, 'file') ?? '');
  if (!/^[a-f0-9]{40}\.webp$/.test(file)) throw createError({ statusCode: 404, statusMessage: 'Not found' });

  const dir = path.resolve(process.env.ICONS_DIR || path.join(process.cwd(), 'public', 'icons'));
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) throw createError({ statusCode: 404, statusMessage: 'Not found' });

  setHeader(event, 'content-type', 'image/webp');
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable');
  return sendStream(event, fs.createReadStream(full));
});
