import boundaries from 'eslint-plugin-boundaries';
import withNuxt from './.nuxt/eslint.config.mjs';

const APP_LAYER_MESSAGE =
  'App layers flow shared -> entities -> features -> pages. A slice may import only lower layers: ' +
  'shared from shared, entities from shared/entities, features from shared/entities, pages from shared/entities/features.';

const SHARED_PACKAGE_MESSAGE =
  'Import @dossier/shared through a subpath: /contracts, /ranks or /format. The barrel pulls node:crypto into the browser bundle.';

export default withNuxt(
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['app/**/*.{ts,vue}'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['app/**/*'],
      // Extensionless TypeScript imports need a TS-aware resolver for the boundary rule to
      // see their real target; the node resolver alone leaves them "unknown" and unchecked.
      'import/resolver': {
        typescript: { project: ['tsconfig.node.json'], alwaysTryTypes: true },
        node: { extensions: ['.js', '.ts', '.vue', '.mjs', '.json'] },
      },
      'boundaries/elements': [
        { type: 'shared', pattern: 'app/shared' },
        { type: 'entities', pattern: 'app/entities/*', capture: ['entity'] },
        { type: 'features', pattern: 'app/features/*', capture: ['feature'] },
        { type: 'pages', pattern: 'app/pages' },
        { type: 'app-shell', pattern: 'app' },
      ],
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@dossier/core', message: 'The app talks to the server through the HTTP API, never to core.' },
            { name: '@dossier/mcp', message: 'The app talks to the server through the HTTP API, never to an MCP client.' },
            { name: '@dossier/sources', message: 'Source adapters run on the server only; the app never imports them.' },
            { name: '@dossier/shared', message: SHARED_PACKAGE_MESSAGE },
          ],
          patterns: [
            { group: ['@dossier/core/*'], message: 'The app talks to the server through the HTTP API, never to core.' },
            { group: ['@dossier/mcp/*'], message: 'The app talks to the server through the HTTP API, never to an MCP client.' },
            { group: ['@dossier/sources/*'], message: 'Source adapters run on the server only; the app never imports them.' },
            {
              group: [
                '@dossier/shared/**',
                '!@dossier/shared/contracts',
                '!@dossier/shared/contracts/**',
                '!@dossier/shared/ranks',
                '!@dossier/shared/format',
              ],
              message: SHARED_PACKAGE_MESSAGE,
            },
          ],
        },
      ],
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message: APP_LAYER_MESSAGE,
          policies: [
            { from: { element: { type: 'shared' } }, allow: { to: { element: { type: 'shared' } } } },
            { from: { element: { type: 'entities' } }, allow: { to: { element: { types: ['shared', 'entities'] } } } },
            { from: { element: { type: 'features' } }, allow: { to: { element: { types: ['shared', 'entities'] } } } },
            {
              from: { element: { type: 'pages' } },
              allow: { to: { element: { types: ['shared', 'entities', 'features'] } } },
            },
            {
              from: { element: { type: 'app-shell' } },
              allow: { to: { element: { types: ['shared', 'entities', 'features', 'pages', 'app-shell'] } } },
            },
          ],
        },
      ],
    },
  },
);
