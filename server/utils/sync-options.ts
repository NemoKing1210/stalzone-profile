import type { SyncOptions } from '@profile/core';

/**
 * Sync options that depend on the deployment: the icon directory comes from
 * `ICONS_DIR` and the profile API credentials from runtimeConfig. Both `/mcp`
 * and the admin route must resolve them the same way the CLI does.
 */
export function serverSyncOptions(): Pick<SyncOptions, 'iconsDir' | 'profileApi'> {
  const config = useRuntimeConfig();
  const profileApi =
    config.stalzoneClientId && config.stalzoneClientSecret
      ? {
          clientId: String(config.stalzoneClientId),
          clientSecret: String(config.stalzoneClientSecret),
          apiUrl: String(config.stalzoneApiUrl || ''),
          tokenUrl: String(config.stalzoneTokenUrl || ''),
        }
      : undefined;
  return { iconsDir: process.env.ICONS_DIR || undefined, profileApi };
}
