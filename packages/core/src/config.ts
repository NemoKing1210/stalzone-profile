import fs from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  rootDir: string;
  dbPath: string;
  realm: string;
  snapshotsDir: string;
  iconsDir: string;
  migrationsDir: string;
  host: string;
  port: number;
  adminToken: string | null;
  mcpToken: string | null;
  /** Optional official STALZONE API credentials; both must be set to sync a profile. */
  stalzoneClientId: string | null;
  stalzoneClientSecret: string | null;
  stalzoneApiUrl: string;
  stalzoneTokenUrl: string;
}

export function isTruthy(v: unknown): boolean {
  if (v == null) return false;
  return /^(1|true|yes|on)$/i.test(String(v));
}

export function loadEnv(rootDir = process.cwd()): void {
  const file = path.join(rootDir, '.env');
  if (fs.existsSync(file) && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(file);
    } catch {
      /* a malformed .env must not stop the server */
    }
  }
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const rootDir = overrides.rootDir ?? (process.env.ROOT_DIR ? path.resolve(process.env.ROOT_DIR) : process.cwd());
  loadEnv(rootDir);

  const dbPath = path.resolve(rootDir, overrides.dbPath ?? process.env.DB_PATH ?? './data/dossier.db');
  const snapshotsDir = path.resolve(
    rootDir,
    overrides.snapshotsDir ?? process.env.SNAPSHOTS_DIR ?? './snapshots',
  );

  return {
    rootDir,
    dbPath,
    realm: overrides.realm ?? process.env.REALM ?? 'ru',
    snapshotsDir,
    iconsDir: path.resolve(
      rootDir,
      overrides.iconsDir ?? process.env.ICONS_DIR ?? path.join('public', 'icons'),
    ),
    migrationsDir: overrides.migrationsDir ?? path.join(rootDir, 'db', 'migrations'),
    host: overrides.host ?? process.env.HOST ?? '127.0.0.1',
    port: overrides.port ?? Number(process.env.PORT ?? 3000),
    adminToken: overrides.adminToken ?? process.env.ADMIN_TOKEN ?? null,
    mcpToken: overrides.mcpToken ?? process.env.MCP_TOKEN ?? null,
    stalzoneClientId: overrides.stalzoneClientId ?? process.env.STALZONE_CLIENT_ID ?? null,
    stalzoneClientSecret: overrides.stalzoneClientSecret ?? process.env.STALZONE_CLIENT_SECRET ?? null,
    stalzoneApiUrl: overrides.stalzoneApiUrl ?? process.env.STALZONE_API_URL ?? 'https://eapi.stalzone.com',
    stalzoneTokenUrl: overrides.stalzoneTokenUrl ?? process.env.STALZONE_TOKEN_URL ?? 'https://exbo.net/oauth/token',
  };
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
