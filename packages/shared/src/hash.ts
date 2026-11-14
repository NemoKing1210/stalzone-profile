import { createHash } from 'node:crypto';

export function sha1(s: string): string {
  return createHash('sha1').update(s, 'utf8').digest('hex');
}

export function shortHash(s: string, len = 12): string {
  return sha1(s).slice(0, len);
}
