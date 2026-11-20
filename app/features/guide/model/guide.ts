/**
 * The `/guide` page is a product reference: it explains every screen, endpoint, tool,
 * command and source, and how the layers connect. It must not drift from the code, so
 * `tests/unit/app/guide/guide.test.ts` compares this file with `app/pages`, `server/api`,
 * the MCP registry, `package.json` and the sync module.
 *
 * When you add or remove a page, endpoint, MCP tool, CLI script or source, update this
 * file and both locale catalogs.
 */

/**
 * A guide tab. The page renders one section at a time; `titleKey` is both the tab
 * label and the panel heading, `hintKey` the panel counter and `introKey` the one
 * paragraph that says what the section covers.
 */
export interface GuideSection {
  id: string;
  icon: string;
  titleKey: string;
  hintKey: string;
  introKey: string;
}

export interface GuideSitePage {
  id: string;
  route: string;
  icon: string;
  kind: 'main' | 'system';
  titleKey: string;
  summaryKey: string;
  capabilityKeys: readonly string[];
}

export type GuideApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type GuideApiGroup = 'auth' | 'read' | 'write' | 'admin';

export interface GuideApiEndpoint {
  method: GuideApiMethod;
  path: string;
  group: GuideApiGroup;
  descriptionKey: string;
  /** Reachable without a session: the health probe and the sign-in call. */
  publicAccess?: boolean;
}

export interface GuideMcpTool {
  name: string;
  access: 'read' | 'write';
  descriptionKey: string;
}

export type GuideCliGroup = 'dev' | 'data' | 'mcp' | 'quality';

export interface GuideCliCommand {
  /** The command as the owner types it. */
  display: string;
  /** The npm script behind it, or `null` for a plain npm command such as `npm ci`. */
  script: string | null;
  group: GuideCliGroup;
  descriptionKey: string;
  danger?: boolean;
}

export interface GuideSyncSource {
  id: string;
  updatesKey: string;
  triggerKey: string;
  /** `profile` needs credentials and never runs as part of `all`. */
  optIn?: boolean;
}

export interface GuidePrinciple {
  id: string;
  icon: string;
  titleKey: string;
  textKey: string;
}

export interface GuideFlowStep {
  id: string;
  icon: string;
  titleKey: string;
  textKey: string;
  chips: readonly string[];
}

export const GUIDE_SITE: GuideSitePage[] = [
  {
    id: 'overview',
    route: '/',
    icon: 'i-lucide-house',
    kind: 'main',
    titleKey: 'guide.site.overview.title',
    summaryKey: 'guide.site.overview.summary',
    capabilityKeys: [
      'guide.site.overview.caps.profile',
      'guide.site.overview.caps.kpis',
      'guide.site.overview.caps.edit',
      'guide.site.overview.caps.freshness',
    ],
  },
  {
    id: 'inventory',
    route: '/inventory',
    icon: 'i-lucide-package',
    kind: 'main',
    titleKey: 'guide.site.inventory.title',
    summaryKey: 'guide.site.inventory.summary',
    capabilityKeys: [
      'guide.site.inventory.caps.equipment',
      'guide.site.inventory.caps.grid',
      'guide.site.inventory.caps.stash',
      'guide.site.inventory.caps.filter',
      'guide.site.inventory.caps.tidy',
      'guide.site.inventory.caps.intake',
      'guide.site.inventory.caps.loadout',
      'guide.site.inventory.caps.form',
    ],
  },
  {
    id: 'weapons',
    route: '/weapons',
    icon: 'i-lucide-crosshair',
    kind: 'main',
    titleKey: 'guide.site.weapons.title',
    summaryKey: 'guide.site.weapons.summary',
    capabilityKeys: [
      'guide.site.weapons.caps.catalog',
      'guide.site.weapons.caps.dps',
      'guide.site.weapons.caps.filters',
      'guide.site.weapons.caps.manage',
    ],
  },
  {
    id: 'devices',
    route: '/devices',
    icon: 'i-lucide-radar',
    kind: 'main',
    titleKey: 'guide.site.devices.title',
    summaryKey: 'guide.site.devices.summary',
    capabilityKeys: ['guide.site.devices.caps.catalog', 'guide.site.devices.caps.filters'],
  },
  {
    id: 'armor',
    route: '/armor',
    icon: 'i-lucide-shield',
    kind: 'main',
    titleKey: 'guide.site.armor.title',
    summaryKey: 'guide.site.armor.summary',
    capabilityKeys: [
      'guide.site.armor.caps.catalog',
      'guide.site.armor.caps.protection',
      'guide.site.armor.caps.curve',
      'guide.site.armor.caps.manage',
    ],
  },
  {
    id: 'containers',
    route: '/containers',
    icon: 'i-lucide-backpack',
    kind: 'main',
    titleKey: 'guide.site.containers.title',
    summaryKey: 'guide.site.containers.summary',
    capabilityKeys: [
      'guide.site.containers.caps.list',
      'guide.site.containers.caps.fill',
      'guide.site.containers.caps.effect',
      'guide.site.containers.caps.manage',
    ],
  },
  {
    id: 'artifacts',
    route: '/artifacts',
    icon: 'i-lucide-gem',
    kind: 'main',
    titleKey: 'guide.site.artifacts.title',
    summaryKey: 'guide.site.artifacts.summary',
    capabilityKeys: [
      'guide.site.artifacts.caps.catalog',
      'guide.site.artifacts.caps.effects',
      'guide.site.artifacts.caps.filters',
      'guide.site.artifacts.caps.manage',
    ],
  },
  {
    id: 'settings',
    route: '/settings',
    icon: 'i-lucide-settings',
    kind: 'main',
    titleKey: 'guide.site.settings.title',
    summaryKey: 'guide.site.settings.summary',
    capabilityKeys: [
      'guide.site.settings.caps.appearance',
      'guide.site.settings.caps.sources',
      'guide.site.settings.caps.data',
      'guide.site.settings.caps.journal',
      'guide.site.settings.caps.cleanup',
      'guide.site.settings.caps.logging',
      'guide.site.settings.caps.assistant',
    ],
  },
  {
    id: 'logs',
    route: '/logs',
    icon: 'i-lucide-bug',
    kind: 'system',
    titleKey: 'guide.site.logs.title',
    summaryKey: 'guide.site.logs.summary',
    capabilityKeys: [
      'guide.site.logs.caps.filters',
      'guide.site.logs.caps.entries',
      'guide.site.logs.caps.purge',
    ],
  },
  {
    id: 'changelog',
    route: '/changelog',
    icon: 'i-lucide-scroll-text',
    kind: 'main',
    titleKey: 'guide.site.changelog.title',
    summaryKey: 'guide.site.changelog.summary',
    capabilityKeys: [
      'guide.site.changelog.caps.timeline',
      'guide.site.changelog.caps.filters',
      'guide.site.changelog.caps.buildTime',
    ],
  },
  {
    id: 'guide',
    route: '/guide',
    icon: 'i-lucide-map',
    kind: 'main',
    titleKey: 'guide.site.guide.title',
    summaryKey: 'guide.site.guide.summary',
    capabilityKeys: ['guide.site.guide.caps.map', 'guide.site.guide.caps.contract', 'guide.site.guide.caps.live'],
  },
  {
    id: 'setup',
    route: '/setup',
    icon: 'i-lucide-wand-sparkles',
    kind: 'system',
    titleKey: 'guide.site.setup.title',
    summaryKey: 'guide.site.setup.summary',
    capabilityKeys: [
      'guide.site.setup.caps.character',
      'guide.site.setup.caps.catalog',
      'guide.site.setup.caps.profile',
    ],
  },
  {
    id: 'login',
    route: '/login',
    icon: 'i-lucide-lock-keyhole',
    kind: 'system',
    titleKey: 'guide.site.login.title',
    summaryKey: 'guide.site.login.summary',
    capabilityKeys: ['guide.site.login.caps.password', 'guide.site.login.caps.rateLimit', 'guide.site.login.caps.locale'],
  },
];

export const GUIDE_API: GuideApiEndpoint[] = [
  // Sign-in and session.
  { method: 'POST', path: '/api/auth/login', group: 'auth', descriptionKey: 'guide.api.auth.login', publicAccess: true },
  { method: 'POST', path: '/api/auth/logout', group: 'auth', descriptionKey: 'guide.api.auth.logout' },
  { method: 'GET', path: '/api/auth/me', group: 'auth', descriptionKey: 'guide.api.auth.me' },

  // Reads.
  {
    method: 'GET',
    path: '/api/v1/healthz',
    group: 'read',
    descriptionKey: 'guide.api.reads.healthz',
    publicAccess: true,
  },
  { method: 'GET', path: '/api/v1/setup', group: 'read', descriptionKey: 'guide.api.reads.setup' },
  { method: 'GET', path: '/api/v1/payload', group: 'read', descriptionKey: 'guide.api.reads.payload' },
  { method: 'GET', path: '/api/v1/meta', group: 'read', descriptionKey: 'guide.api.reads.meta' },
  { method: 'GET', path: '/api/v1/character', group: 'read', descriptionKey: 'guide.api.reads.character' },
  { method: 'GET', path: '/api/v1/items', group: 'read', descriptionKey: 'guide.api.reads.items' },
  { method: 'GET', path: '/api/v1/items/:id', group: 'read', descriptionKey: 'guide.api.reads.item' },
  { method: 'GET', path: '/api/v1/details/:key', group: 'read', descriptionKey: 'guide.api.reads.details' },
  { method: 'GET', path: '/api/v1/catalog', group: 'read', descriptionKey: 'guide.api.reads.catalog' },
  { method: 'GET', path: '/api/v1/inventory', group: 'read', descriptionKey: 'guide.api.reads.inventory' },
  {
    method: 'GET',
    path: '/api/v1/inventory/items/:id',
    group: 'read',
    descriptionKey: 'guide.api.reads.inventoryItem',
  },
  { method: 'GET', path: '/api/v1/containers', group: 'read', descriptionKey: 'guide.api.reads.containers' },
  { method: 'GET', path: '/api/v1/prices', group: 'read', descriptionKey: 'guide.api.reads.prices' },
  { method: 'GET', path: '/api/v1/sources', group: 'read', descriptionKey: 'guide.api.reads.sources' },
  { method: 'GET', path: '/api/v1/events', group: 'read', descriptionKey: 'guide.api.reads.events' },
  { method: 'GET', path: '/api/v1/logs', group: 'read', descriptionKey: 'guide.api.reads.logs' },
  { method: 'GET', path: '/api/v1/logs/config', group: 'read', descriptionKey: 'guide.api.reads.logsConfig' },
  { method: 'GET', path: '/api/v1/logs/stats', group: 'read', descriptionKey: 'guide.api.reads.logsStats' },
  { method: 'GET', path: '/api/v1/admin/export', group: 'read', descriptionKey: 'guide.api.reads.export' },

  // Writes: dry-run by default at the MCP edge, `dryRun` optional in the body.
  { method: 'POST', path: '/api/v1/character', group: 'write', descriptionKey: 'guide.api.writes.characterCreate' },
  { method: 'PATCH', path: '/api/v1/character', group: 'write', descriptionKey: 'guide.api.writes.characterPatch' },
  { method: 'DELETE', path: '/api/v1/logs', group: 'write', descriptionKey: 'guide.api.writes.logsPurge' },
  { method: 'POST', path: '/api/v1/logs/client', group: 'write', descriptionKey: 'guide.api.writes.logsClient' },
  {
    method: 'POST',
    path: '/api/v1/inventory/items',
    group: 'write',
    descriptionKey: 'guide.api.writes.inventoryItemCreate',
  },
  {
    method: 'PATCH',
    path: '/api/v1/inventory/items/:id',
    group: 'write',
    descriptionKey: 'guide.api.writes.inventoryItemPatch',
  },
  {
    method: 'DELETE',
    path: '/api/v1/inventory/items/:id',
    group: 'write',
    descriptionKey: 'guide.api.writes.inventoryItemDelete',
  },
  {
    method: 'POST',
    path: '/api/v1/inventory/items/:id/move',
    group: 'write',
    descriptionKey: 'guide.api.writes.inventoryItemMove',
  },
  {
    method: 'POST',
    path: '/api/v1/inventory/storages',
    group: 'write',
    descriptionKey: 'guide.api.writes.storageCreate',
  },
  {
    method: 'PATCH',
    path: '/api/v1/inventory/storages/:id',
    group: 'write',
    descriptionKey: 'guide.api.writes.storagePatch',
  },
  {
    method: 'DELETE',
    path: '/api/v1/inventory/storages/:id',
    group: 'write',
    descriptionKey: 'guide.api.writes.storageDelete',
  },
  {
    method: 'POST',
    path: '/api/v1/inventory/storages/:id/auto-arrange',
    group: 'write',
    descriptionKey: 'guide.api.writes.storageAutoArrange',
  },
  {
    method: 'POST',
    path: '/api/v1/inventory/storages/:id/tidy',
    group: 'write',
    descriptionKey: 'guide.api.writes.storageTidy',
  },
  {
    method: 'PUT',
    path: '/api/v1/inventory/containers/:id/fill',
    group: 'write',
    descriptionKey: 'guide.api.writes.containerFill',
  },
  {
    method: 'PUT',
    path: '/api/v1/inventory/weapons/:id/modules/:slot',
    group: 'write',
    descriptionKey: 'guide.api.writes.weaponModule',
  },
  {
    method: 'PATCH',
    path: '/api/v1/items/:id/layout',
    group: 'write',
    descriptionKey: 'guide.api.writes.itemLayout',
  },
  { method: 'POST', path: '/api/v1/events/:id/rollback', group: 'write', descriptionKey: 'guide.api.writes.rollback' },

  { method: 'GET', path: '/api/v1/chat/settings', group: 'read', descriptionKey: 'guide.api.chat.settingsRead' },
  { method: 'PATCH', path: '/api/v1/chat/settings', group: 'write', descriptionKey: 'guide.api.chat.settings' },
  { method: 'POST', path: '/api/v1/chat/test', group: 'write', descriptionKey: 'guide.api.chat.test' },
  // Administration: scoped profile resets and source sync.
  { method: 'GET', path: '/api/v1/admin/cleanup', group: 'admin', descriptionKey: 'guide.api.admin.cleanupRead' },
  { method: 'GET', path: '/api/v1/admin/logging', group: 'admin', descriptionKey: 'guide.api.admin.loggingRead' },
  { method: 'PATCH', path: '/api/v1/admin/logging', group: 'admin', descriptionKey: 'guide.api.admin.logging' },
  { method: 'POST', path: '/api/v1/admin/cleanup', group: 'admin', descriptionKey: 'guide.api.admin.cleanup' },
  { method: 'POST', path: '/api/v1/admin/sync', group: 'admin', descriptionKey: 'guide.api.admin.sync' },
  { method: 'GET', path: '/api/v1/admin/sync', group: 'admin', descriptionKey: 'guide.api.admin.syncRead' },
  {
    method: 'PUT',
    path: '/api/v1/admin/sync',
    group: 'admin',
    descriptionKey: 'guide.api.admin.syncSchedule',
  },
];

export const GUIDE_MCP: GuideMcpTool[] = [
  { name: 'get_character', access: 'read', descriptionKey: 'guide.mcp.tools.get_character' },
  { name: 'find_items', access: 'read', descriptionKey: 'guide.mcp.tools.find_items' },
  { name: 'get_item', access: 'read', descriptionKey: 'guide.mcp.tools.get_item' },
  { name: 'compare_items', access: 'read', descriptionKey: 'guide.mcp.tools.compare_items' },
  { name: 'get_inventory', access: 'read', descriptionKey: 'guide.mcp.tools.get_inventory' },
  { name: 'list_storages', access: 'read', descriptionKey: 'guide.mcp.tools.list_storages' },
  {
    name: 'list_inventory_items',
    access: 'read',
    descriptionKey: 'guide.mcp.tools.list_inventory_items',
  },
  { name: 'list_containers', access: 'read', descriptionKey: 'guide.mcp.tools.list_containers' },
  { name: 'plan_artifact_build', access: 'read', descriptionKey: 'guide.mcp.tools.plan_artifact_build' },
  { name: 'get_prices', access: 'read', descriptionKey: 'guide.mcp.tools.get_prices' },
  { name: 'sources_status', access: 'read', descriptionKey: 'guide.mcp.tools.sources_status' },
  { name: 'export_profile_json', access: 'read', descriptionKey: 'guide.mcp.tools.export_profile_json' },
  { name: 'list_logs', access: 'read', descriptionKey: 'guide.mcp.tools.list_logs' },
  { name: 'log_stats', access: 'read', descriptionKey: 'guide.mcp.tools.log_stats' },
  { name: 'get_logging', access: 'read', descriptionKey: 'guide.mcp.tools.get_logging' },
  { name: 'add_inventory_item', access: 'write', descriptionKey: 'guide.mcp.tools.add_inventory_item' },
  {
    name: 'update_inventory_item',
    access: 'write',
    descriptionKey: 'guide.mcp.tools.update_inventory_item',
  },
  {
    name: 'remove_inventory_item',
    access: 'write',
    descriptionKey: 'guide.mcp.tools.remove_inventory_item',
  },
  { name: 'move_inventory_item', access: 'write', descriptionKey: 'guide.mcp.tools.move_inventory_item' },
  { name: 'create_storage', access: 'write', descriptionKey: 'guide.mcp.tools.create_storage' },
  { name: 'update_storage', access: 'write', descriptionKey: 'guide.mcp.tools.update_storage' },
  { name: 'delete_storage', access: 'write', descriptionKey: 'guide.mcp.tools.delete_storage' },
  { name: 'set_container_artifacts', access: 'write', descriptionKey: 'guide.mcp.tools.set_container_artifacts' },
  { name: 'set_weapon_module', access: 'write', descriptionKey: 'guide.mcp.tools.set_weapon_module' },
  { name: 'set_item_layout', access: 'write', descriptionKey: 'guide.mcp.tools.set_item_layout' },
  { name: 'auto_arrange_storage', access: 'write', descriptionKey: 'guide.mcp.tools.auto_arrange_storage' },
  { name: 'sync_source', access: 'write', descriptionKey: 'guide.mcp.tools.sync_source' },
  { name: 'rebuild_site', access: 'write', descriptionKey: 'guide.mcp.tools.rebuild_site' },
  { name: 'rollback_event', access: 'write', descriptionKey: 'guide.mcp.tools.rollback_event' },
  { name: 'update_logging', access: 'write', descriptionKey: 'guide.mcp.tools.update_logging' },
  { name: 'clear_logs', access: 'write', descriptionKey: 'guide.mcp.tools.clear_logs' },
];

export const GUIDE_CLI: GuideCliCommand[] = [
  { display: 'npm ci', script: null, group: 'dev', descriptionKey: 'guide.cli.commands.install' },
  { display: 'npm run dev', script: 'dev', group: 'dev', descriptionKey: 'guide.cli.commands.dev' },
  { display: 'npm run build', script: 'build', group: 'dev', descriptionKey: 'guide.cli.commands.build' },
  { display: 'npm run start', script: 'start', group: 'dev', descriptionKey: 'guide.cli.commands.start' },
  { display: 'npm run build:cli', script: 'build:cli', group: 'dev', descriptionKey: 'guide.cli.commands.buildCli' },
  { display: 'npm run db:migrate', script: 'db:migrate', group: 'data', descriptionKey: 'guide.cli.commands.migrate' },
  {
    display: 'npm run db:reset',
    script: 'db:reset',
    group: 'data',
    descriptionKey: 'guide.cli.commands.reset',
    danger: true,
  },
  { display: 'npm run sync [source|all]', script: 'sync', group: 'data', descriptionKey: 'guide.cli.commands.sync' },
  { display: 'npm run export:json', script: 'export:json', group: 'data', descriptionKey: 'guide.cli.commands.export' },
  { display: 'npm run backup', script: 'backup', group: 'data', descriptionKey: 'guide.cli.commands.backup' },
  {
    display: 'npm run logs -- --level=error --since=24h',
    script: 'logs',
    group: 'data',
    descriptionKey: 'guide.cli.commands.logs',
  },
  {
    display: "npm run hash-password -- 'password'",
    script: 'hash-password',
    group: 'data',
    descriptionKey: 'guide.cli.commands.hashPassword',
  },
  { display: 'npm run mcp', script: 'mcp', group: 'mcp', descriptionKey: 'guide.cli.commands.mcp' },
  { display: 'npm run smoke:mcp', script: 'smoke:mcp', group: 'mcp', descriptionKey: 'guide.cli.commands.smoke' },
  { display: 'npm test', script: 'test', group: 'quality', descriptionKey: 'guide.cli.commands.test' },
  { display: 'npm run test:unit', script: 'test:unit', group: 'quality', descriptionKey: 'guide.cli.commands.testUnit' },
  {
    display: 'npm run test:integration',
    script: 'test:integration',
    group: 'quality',
    descriptionKey: 'guide.cli.commands.testIntegration',
  },
  {
    display: 'npm run test:related -- <files>',
    script: 'test:related',
    group: 'quality',
    descriptionKey: 'guide.cli.commands.testRelated',
  },
  { display: 'npm run typecheck', script: 'typecheck', group: 'quality', descriptionKey: 'guide.cli.commands.typecheck' },
  {
    display: 'npm run typecheck:node',
    script: 'typecheck:node',
    group: 'quality',
    descriptionKey: 'guide.cli.commands.typecheckNode',
  },
  { display: 'npm run lint', script: 'lint', group: 'quality', descriptionKey: 'guide.cli.commands.lint' },
  { display: 'npm run boundaries', script: 'boundaries', group: 'quality', descriptionKey: 'guide.cli.commands.boundaries' },
  { display: 'npm run check', script: 'check', group: 'quality', descriptionKey: 'guide.cli.commands.check' },
  { display: 'npm run golden', script: 'golden', group: 'quality', descriptionKey: 'guide.cli.commands.golden' },
];

export const GUIDE_SOURCES: GuideSyncSource[] = [
  {
    id: 'exbo_base',
    updatesKey: 'guide.sources.updates.exbo_base',
    triggerKey: 'guide.sources.triggers.catalog',
  },
  { id: 'wiki', updatesKey: 'guide.sources.updates.wiki', triggerKey: 'guide.sources.triggers.catalog' },
  { id: 'motifs', updatesKey: 'guide.sources.updates.motifs', triggerKey: 'guide.sources.triggers.catalog' },
  { id: 'scpmodel', updatesKey: 'guide.sources.updates.scpmodel', triggerKey: 'guide.sources.triggers.prices' },
  { id: 'icons', updatesKey: 'guide.sources.updates.icons', triggerKey: 'guide.sources.triggers.catalog' },
  {
    id: 'profile',
    updatesKey: 'guide.sources.updates.profile',
    triggerKey: 'guide.sources.triggers.profile',
    optIn: true,
  },
];

export const GUIDE_PRINCIPLES: GuidePrinciple[] = [
  { id: 'singleSource', icon: 'i-lucide-database', titleKey: 'guide.principles.singleSource.title', textKey: 'guide.principles.singleSource.text' },
  { id: 'journal', icon: 'i-lucide-history', titleKey: 'guide.principles.journal.title', textKey: 'guide.principles.journal.text' },
  { id: 'numbers', icon: 'i-lucide-ruler', titleKey: 'guide.principles.numbers.title', textKey: 'guide.principles.numbers.text' },
  { id: 'formula', icon: 'i-lucide-square-function', titleKey: 'guide.principles.formula.title', textKey: 'guide.principles.formula.text' },
  { id: 'privacy', icon: 'i-lucide-shield-check', titleKey: 'guide.principles.privacy.title', textKey: 'guide.principles.privacy.text' },
  { id: 'auth', icon: 'i-lucide-key-round', titleKey: 'guide.principles.auth.title', textKey: 'guide.principles.auth.text' },
];

export const GUIDE_READ_FLOW: GuideFlowStep[] = [
  {
    id: 'sources',
    icon: 'i-lucide-cloud-download',
    titleKey: 'guide.flow.read.sources.title',
    textKey: 'guide.flow.read.sources.text',
    chips: ['packages/sources'],
  },
  {
    id: 'sync',
    icon: 'i-lucide-refresh-cw',
    titleKey: 'guide.flow.read.sync.title',
    textKey: 'guide.flow.read.sync.text',
    chips: ['modules/sync'],
  },
  {
    id: 'sqlite',
    icon: 'i-lucide-database',
    titleKey: 'guide.flow.read.sqlite.title',
    textKey: 'guide.flow.read.sqlite.text',
    chips: ['profile.db', 'WAL'],
  },
  {
    id: 'core',
    icon: 'i-lucide-boxes',
    titleKey: 'guide.flow.read.core.title',
    textKey: 'guide.flow.read.core.text',
    chips: ['modules/*', 'read-model'],
  },
  {
    id: 'clients',
    icon: 'i-lucide-monitor-smartphone',
    titleKey: 'guide.flow.read.clients.title',
    textKey: 'guide.flow.read.clients.text',
    chips: ['app', 'server/api', 'packages/mcp', 'scripts'],
  },
];

export const GUIDE_WRITE_FLOW: GuideFlowStep[] = [
  {
    id: 'entry',
    icon: 'i-lucide-pencil-line',
    titleKey: 'guide.flow.write.entry.title',
    textKey: 'guide.flow.write.entry.text',
    chips: ['useWrite', '/api/v1', 'MCP', 'CLI'],
  },
  {
    id: 'service',
    icon: 'i-lucide-shield-check',
    titleKey: 'guide.flow.write.service.title',
    textKey: 'guide.flow.write.service.text',
    chips: ['requireSession', 'zod', 'write.ts'],
  },
  {
    id: 'transaction',
    icon: 'i-lucide-git-commit-horizontal',
    titleKey: 'guide.flow.write.transaction.title',
    textKey: 'guide.flow.write.transaction.text',
    chips: ['SQLite', 'event_log'],
  },
  {
    id: 'result',
    icon: 'i-lucide-circle-check',
    titleKey: 'guide.flow.write.result.title',
    textKey: 'guide.flow.write.result.text',
    chips: ['dryRun', 'diff', 'rollback'],
  },
];

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'site',
    icon: 'i-lucide-layout-grid',
    titleKey: 'guide.sections.site.title',
    hintKey: 'guide.sections.site.hint',
    introKey: 'guide.sections.site.intro',
  },
  {
    id: 'flow',
    icon: 'i-lucide-workflow',
    titleKey: 'guide.sections.flow.title',
    hintKey: 'guide.sections.flow.hint',
    introKey: 'guide.sections.flow.intro',
  },
  {
    id: 'api',
    icon: 'i-lucide-braces',
    titleKey: 'guide.sections.api.title',
    hintKey: 'guide.sections.api.hint',
    introKey: 'guide.sections.api.intro',
  },
  {
    id: 'mcp',
    icon: 'i-lucide-bot',
    titleKey: 'guide.sections.mcp.title',
    hintKey: 'guide.sections.mcp.hint',
    introKey: 'guide.sections.mcp.intro',
  },
  {
    id: 'cli',
    icon: 'i-lucide-terminal',
    titleKey: 'guide.sections.cli.title',
    hintKey: 'guide.sections.cli.hint',
    introKey: 'guide.sections.cli.intro',
  },
  {
    id: 'sources',
    icon: 'i-lucide-cloud',
    titleKey: 'guide.sections.sources.title',
    hintKey: 'guide.sections.sources.hint',
    introKey: 'guide.sections.sources.intro',
  },
  {
    id: 'principles',
    icon: 'i-lucide-scale',
    titleKey: 'guide.sections.principles.title',
    hintKey: 'guide.sections.principles.hint',
    introKey: 'guide.sections.principles.intro',
  },
];

/**
 * Keys used directly by the page template (headings, column labels, badges).
 * Collected here so the test can prove both catalogs carry them.
 */
export const GUIDE_TEXT_KEYS: readonly string[] = [
  'guide.title',
  'guide.subtitle',
  'guide.lead',
  'guide.tabs.label',
  'guide.stats.pages',
  'guide.stats.endpoints',
  'guide.stats.tools',
  'guide.stats.sources',
  'guide.live.title',
  'guide.live.owned',
  'guide.live.catalog',
  'guide.live.updated',
  'guide.site.badge.main',
  'guide.site.badge.system',
  'guide.site.open',
  'guide.flow.readTitle',
  'guide.flow.writeTitle',
  'guide.flow.layersTitle',
  'guide.flow.layersText',
  'guide.flow.arrow',
  'guide.api.groups.auth',
  'guide.api.groups.read',
  'guide.api.groups.write',
  'guide.api.groups.admin',
  'guide.api.public',
  'guide.api.note',
  'guide.mcp.readTitle',
  'guide.mcp.writeTitle',
  'guide.mcp.policyTitle',
  'guide.mcp.policy.dryRun',
  'guide.mcp.policy.confirm',
  'guide.mcp.policy.rate',
  'guide.mcp.policy.rebuild',
  'guide.cli.groups.dev',
  'guide.cli.groups.data',
  'guide.cli.groups.mcp',
  'guide.cli.groups.quality',
  'guide.cli.danger',
  'guide.cli.note',
  'guide.sources.columns.source',
  'guide.sources.columns.updates',
  'guide.sources.columns.trigger',
  'guide.sources.optIn',
  'guide.sources.note',
  'guide.keep.title',
  'guide.keep.text',
];

/** Every key the guide renders, for the locale-catalog contract test. */
export function guideI18nKeys(): string[] {
  const keys = new Set<string>(GUIDE_TEXT_KEYS);

  for (const page of GUIDE_SITE) {
    keys.add(page.titleKey);
    keys.add(page.summaryKey);
    for (const capability of page.capabilityKeys) keys.add(capability);
  }
  for (const endpoint of GUIDE_API) keys.add(endpoint.descriptionKey);
  for (const tool of GUIDE_MCP) keys.add(tool.descriptionKey);
  for (const command of GUIDE_CLI) keys.add(command.descriptionKey);
  for (const source of GUIDE_SOURCES) {
    keys.add(source.updatesKey);
    keys.add(source.triggerKey);
  }
  for (const principle of GUIDE_PRINCIPLES) {
    keys.add(principle.titleKey);
    keys.add(principle.textKey);
  }
  for (const step of [...GUIDE_READ_FLOW, ...GUIDE_WRITE_FLOW]) {
    keys.add(step.titleKey);
    keys.add(step.textKey);
  }
  for (const section of GUIDE_SECTIONS) {
    keys.add(section.titleKey);
    keys.add(section.hintKey);
    keys.add(section.introKey);
  }

  return [...keys].sort();
}
