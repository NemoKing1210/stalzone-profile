import fs from 'node:fs';
import path from 'node:path';

export interface ProfileSnapshot {
  username?: string;
  fetched?: string;
  source?: string;
  region?: string;
  faction?: string;
  arrivedInZone?: string;
  lastOnline?: string;
  playtimeHours?: number;
  kd?: number;
  accuracy?: number;
  headshotShare?: number;
  clanHistory?: string;
  achievementPoints?: number;
  stats?: Record<string, any>;
  [key: string]: unknown;
}

export interface ProfileFetchOptions {
  file?: string;
}

export const DEFAULT_PROFILE_FILE = path.join(process.cwd(), 'db', 'seeds', 'profile.json');

/**
 * The official STALZONE API does not expose inventory or a public profile to
 * third-party apps, so the profile is a manual snapshot of a public player page.
 * Sync refreshes the database from that snapshot file; it does not scrape.
 */
export const profileAdapter = {
  async fetch(options: ProfileFetchOptions = {}): Promise<ProfileSnapshot> {
    const file = options.file ?? process.env.PROFILE_FILE ?? DEFAULT_PROFILE_FILE;
    if (!fs.existsSync(file)) throw new Error(`profile snapshot not found: ${file}`);
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ProfileSnapshot;
  },
};
