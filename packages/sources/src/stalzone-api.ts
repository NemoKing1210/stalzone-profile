import type { FetchLike } from './exbo.js';

type Json = Record<string, any>;

export interface StalzoneProfileStat {
  id: string;
  type: string | null;
  value: string | number | null;
}

export interface StalzoneProfile {
  username: string;
  uuid: string | null;
  status: string | null;
  alliance: string | null;
  lastLogin: string | null;
  clan: { name: string | null; rank: string | null } | null;
  achievements: string[];
  stats: StalzoneProfileStat[];
}

export interface StalzoneApiOptions {
  clientId: string;
  clientSecret: string;
  apiUrl?: string;
  tokenUrl?: string;
}

export const STALZONE_API_URL = 'https://eapi.stalzone.com';
export const STALZONE_TOKEN_URL = 'https://exbo.net/oauth/token';

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function statOf(raw: Json): StalzoneProfileStat | null {
  const id = raw?.id ?? raw?.key;
  if (typeof id !== 'string' || id === '') return null;
  const value = raw.value;
  const usable =
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim() !== '') ||
    value == null;
  if (!usable) return null;
  return { id, type: text(raw.type), value: value ?? null };
}

/**
 * Reads the public profile of one character through OAuth client credentials.
 * The response shape is treated tolerantly: unknown wrappers and extra fields
 * are ignored, and a missing counter stays absent instead of becoming zero.
 */
export async function fetchStalzoneProfile(
  input: StalzoneApiOptions & { nick: string; region: string; fetchImpl: FetchLike },
): Promise<StalzoneProfile> {
  const tokenUrl = input.tokenUrl || STALZONE_TOKEN_URL;
  const apiUrl = input.apiUrl || STALZONE_API_URL;

  const tokenResponse = await input.fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: 'client_credentials',
      scope: '',
    }).toString(),
  });
  if (tokenResponse.status < 200 || tokenResponse.status >= 300) {
    throw new Error(`stalzone token HTTP ${tokenResponse.status}`);
  }
  const token = (await tokenResponse.json()) as Json;
  if (!text(token.access_token)) throw new Error('stalzone token response has no access_token');

  const url = `${apiUrl.replace(/\/$/, '')}/${input.region.toUpperCase()}/character/by-name/${encodeURIComponent(
    input.nick,
  )}/profile`;
  const response = await input.fetchImpl(url, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`stalzone api HTTP ${response.status}`);
  }

  const body = (await response.json()) as Json;
  const root: Json = body?.data ?? body?.profile ?? body ?? {};
  const clanNode = root.clan;
  const clanName = text(clanNode?.info?.name) ?? text(clanNode?.name);
  const clanRank = text(clanNode?.member?.rank) ?? text(clanNode?.rank);
  const rawStats: unknown = root.stats ?? root.profile?.stats ?? [];
  const stats = Array.isArray(rawStats)
    ? rawStats.map((raw) => statOf(raw as Json)).filter((stat): stat is StalzoneProfileStat => !!stat)
    : [];

  return {
    username: text(root.username) ?? text(root.nick) ?? input.nick,
    uuid: text(root.uuid),
    status: text(root.status),
    alliance: text(root.alliance) ?? text(root.alliance?.name),
    lastLogin: text(root.lastLogin) ?? text(root.last_login),
    clan: clanName || clanRank ? { name: clanName, rank: clanRank } : null,
    achievements: Array.isArray(root.achievements)
      ? root.achievements.filter((entry: unknown): entry is string => typeof entry === 'string')
      : [],
    stats,
  };
}
