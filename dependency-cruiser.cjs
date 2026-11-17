/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'shared-no-other-workspace-package',
      severity: 'error',
      comment: 'packages/shared is the lowest layer and must not import another workspace package.',
      from: { path: '^packages/shared/' },
      to: { path: '^packages/(core|mcp|sources)/' },
    },
    {
      name: 'shared-contracts-no-node-core',
      severity: 'error',
      comment: 'Contract modules are browser-safe: no node:* imports under packages/shared/src/contracts.',
      from: { path: '^packages/shared/src/contracts/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'sources-no-upper-layers',
      severity: 'error',
      comment: 'Source adapters are pure: they may import shared only.',
      from: { path: '^packages/sources/' },
      to: { path: '^(packages/core|packages/mcp|server|app)/' },
    },
    {
      name: 'core-no-upper-layers',
      severity: 'error',
      comment: 'packages/core is the domain layer and must not import MCP, server or app.',
      from: { path: '^packages/core/' },
      to: { path: '^(packages/mcp|server|app)/' },
    },
    {
      name: 'mcp-no-upper-layers',
      severity: 'error',
      comment: 'packages/mcp is an adapter and must not import server or app.',
      from: { path: '^packages/mcp/' },
      to: { path: '^(server|app)/' },
    },
    {
      name: 'server-no-app',
      severity: 'error',
      comment: 'server is the HTTP adapter and must not import the Nuxt app.',
      from: { path: '^server/' },
      to: { path: '^app/' },
    },
    {
      name: 'app-no-core',
      severity: 'error',
      comment: 'The browser app talks to the dossier through the HTTP API, never through @dossier/core.',
      from: { path: '^app/' },
      to: { path: '^packages/core/' },
    },
    {
      name: 'app-no-server-packages',
      severity: 'error',
      comment: 'The browser app must not import the Node-only workspace packages mcp or sources.',
      from: { path: '^app/' },
      to: { path: '^packages/(mcp|sources)/' },
    },

    /* ------------------------------ core module map ------------------------------ */

    {
      name: 'platform-no-modules',
      severity: 'error',
      comment: 'platform is the infrastructure layer inside core; it never imports a domain module.',
      from: { path: '^packages/core/src/platform/' },
      to: { path: '^packages/core/src/modules/' },
    },
    {
      name: 'catalog-no-siblings',
      severity: 'error',
      comment: 'catalog is upstream reference data; it never imports another domain module.',
      from: { path: '^packages/core/src/modules/catalog/' },
      to: { path: '^packages/core/src/modules/(?!catalog/)' },
    },
    {
      name: 'identity-upstream-only',
      severity: 'error',
      comment: 'identity may import platform, shared and catalog (stat definitions); never a downstream module.',
      from: { path: '^packages/core/src/modules/identity/' },
      to: { path: '^packages/core/src/modules/(?!identity/|catalog/)' },
    },
    {
      name: 'inventory-upstream-only',
      severity: 'error',
      comment: 'inventory may import platform, shared, catalog and identity; never builds/sync/maintenance/read-model/setup.',
      from: { path: '^packages/core/src/modules/inventory/' },
      to: { path: '^packages/core/src/modules/(?!inventory/|catalog/|identity/)' },
    },
    {
      name: 'builds-upstream-only',
      severity: 'error',
      comment: 'builds may import platform, shared and catalog; never another downstream module.',
      from: { path: '^packages/core/src/modules/builds/' },
      to: { path: '^packages/core/src/modules/(?!builds/|catalog/)' },
    },
    {
      name: 'sync-upstream-only',
      severity: 'error',
      comment: 'sync may import platform, sources, shared, catalog and identity; never another downstream module.',
      from: { path: '^packages/core/src/modules/sync/' },
      to: { path: '^packages/core/src/modules/(?!sync/|catalog/|identity/)' },
    },
    {
      name: 'domain-modules-no-application-modules',
      severity: 'error',
      comment: 'Domain modules never import application modules (maintenance/read-model/setup); those compose the domain.',
      from: { path: '^packages/core/src/modules/(catalog|identity|inventory|builds|sync)/' },
      to: {
        path: '^packages/core/src/modules/(?!catalog/|identity/|inventory/|builds/|sync/)[^/]+/',
      },
    },

    /* ------------------------------ adapters and the core surface ------------------------------ */

    {
      name: 'mcp-server-no-core-internals',
      severity: 'error',
      comment:
        'MCP and server use the @dossier/core façade only; modules and repositories are not their API (bootstrap files are handled by the next rule).',
      from: { path: '^(packages/mcp|server)/' },
      to: { path: '^packages/core/src/modules/' },
    },
    {
      name: 'core-bootstrap-only',
      severity: 'error',
      comment:
        'Only the DB/bootstrap adapters may import @dossier/core/config, /db and /platform/*; everything else imports the façade.',
      from: {
        path: '^(packages/mcp|server)/',
        pathNot: '^(server/utils/db\\.ts|packages/mcp/src/stdio\\.ts)$',
      },
      to: { path: '^packages/core/src/(config|db|platform)/' },
    },
    {
      name: 'tests-core-public-only',
      severity: 'error',
      comment:
        'Tests import the core façade, @dossier/core/testing, platform public entries or a module index; never repos or module internals.',
      from: { path: '^tests/' },
      to: {
        path:
          '^packages/core/src/(db/|modules/[^/]+/(repo|service|calc)/|modules/[^/]+/(write|payload|export|read|resolve)\\.ts$)',
      },
    },
    {
      name: 'tests-seed-uses-testing',
      severity: 'error',
      comment: 'tests/fixtures/seed.ts seeds through @dossier/core/testing, not through the application façade.',
      from: { path: '^tests/fixtures/seed\\.ts$' },
      to: { path: '^packages/core/src/(modules|platform)/' },
    },

    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A dependency cycle makes module boundaries meaningless.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|\\.nuxt|\\.output|dist|coverage|superpowers|\\.superpowers)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
