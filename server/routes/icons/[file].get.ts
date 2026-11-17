import fs from 'node:fs';
import path from 'node:path';
import { iconFileMime } from '../../utils/icon-file';

/** Serves downloaded `<sha1>.png`/`.webp` icons from `ICONS_DIR`. */
export default defineEventHandler((event) => {
  const file = String(getRouterParam(event, 'file') ?? '');
  const mime = iconFileMime(file);
  if (!mime) throw createError({ statusCode: 404, statusMessage: 'Not found' });

  const dir = path.resolve(process.env.ICONS_DIR || path.join(process.cwd(), 'public', 'icons'));
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) throw createError({ statusCode: 404, statusMessage: 'Not found' });

  setHeader(event, 'content-type', mime);
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable');
  return sendStream(event, fs.createReadStream(full));
});
