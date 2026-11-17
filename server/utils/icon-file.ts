const MIME: Record<string, string> = { png: 'image/png', webp: 'image/webp' };

/** `<sha1>.<ext>` only; returns the content type or null for anything else. */
export function iconFileMime(file: string): string | null {
  const match = /^([a-f0-9]{40})\.(png|webp)$/.exec(file);
  return match ? (MIME[match[2]!] ?? null) : null;
}
