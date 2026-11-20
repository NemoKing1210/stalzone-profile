import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GUIDE_API,
  GUIDE_CLI,
  GUIDE_MCP,
  GUIDE_PRINCIPLES,
  GUIDE_READ_FLOW,
  GUIDE_SECTIONS,
  GUIDE_SITE,
  GUIDE_SOURCES,
  GUIDE_WRITE_FLOW,
  guideI18nKeys,
} from '~/features/guide/model/guide';

const root = process.cwd();

function readText(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Every Nuxt page is a route: `index.vue` is `/`, `weapons.vue` is `/weapons`. */
function pageRoutes(): string[] {
  return fs
    .readdirSync(path.join(root, 'app/pages'))
    .filter((file) => file.endsWith('.vue'))
    .map((file) => (file === 'index.vue' ? '/' : `/${file.slice(0, -'.vue'.length)}`))
    .sort();
}

/** Turn `server/api/v1/items/[id].get.ts` into `GET /api/v1/items/:id`. */
function apiEndpoints(): string[] {
  return walk(path.join(root, 'server/api'))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => {
      const relative = path.relative(path.join(root, 'server/api'), file).split(path.sep).join('/');
      const match = /^(.+)\.(get|post|patch|put|delete)\.ts$/.exec(relative);
      if (!match) throw new Error(`unexpected API route file: ${relative}`);
      const segments = match[1]!.split('/').map((segment) => segment.replace(/^\[(.+)\]$/, ':$1'));
      return `${match[2]!.toUpperCase()} /api/${segments.join('/')}`;
    })
    .sort();
}

function mcpToolNames(): string[] {
  const text = readText('packages/mcp/src/registry.ts');
  return [
    ...[...text.matchAll(/registerTool\(\s*'([a-z_]+)'/g)].map((match) => match[1]!),
    ...[...text.matchAll(/registerWriteTool\(\s*server,\s*limiter,\s*'([a-z_]+)'/g)].map((match) => match[1]!),
  ].sort();
}

function mcpReadToolNames(): string[] {
  const block = /export const READ_TOOLS[^=]*=\s*\[([\s\S]*?)\];/.exec(readText('packages/mcp/src/registry.ts'))?.[1];
  if (!block) throw new Error('READ_TOOLS block not found');
  return [...block.matchAll(/name:\s*'([a-z_]+)'/g)].map((match) => match[1]!).sort();
}

function packageScripts(): Record<string, string> {
  return (JSON.parse(readText('package.json')) as { scripts: Record<string, string> }).scripts;
}

/** `CATALOG_SOURCES` plus the opt-in `profile` entry, straight from the sync module. */
function syncSourceIds(): string[] {
  const text = readText('packages/core/src/modules/sync/service/sync.ts');
  const catalog = /CATALOG_SOURCES\s*=\s*\[([^\]]+)\]/.exec(text)?.[1] ?? '';
  const profile = /SYNC_SOURCES\s*=\s*\[\.\.\.CATALOG_SOURCES,\s*'([^']+)'\]/.exec(text)?.[1];
  return [...[...catalog.matchAll(/'([^']+)'/g)].map((match) => match[1]!), ...(profile ? [profile] : [])];
}

type Catalog = Record<string, unknown>;

function readCatalog(locale: string): Catalog {
  return JSON.parse(readText(path.join('i18n', 'locales', `${locale}.json`))) as Catalog;
}

function flatten(value: Catalog, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [key, entry] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) flatten(entry as Catalog, full, out);
    else out[full] = String(entry);
  }
  return out;
}

describe('guide site map', () => {
  it('documents every page route and no route that does not exist', () => {
    expect(GUIDE_SITE.map((page) => page.route).sort()).toEqual(pageRoutes());
  });

  it('gives every page a title, a summary and at least two capabilities', () => {
    for (const page of GUIDE_SITE) {
      expect(page.titleKey, page.id).toMatch(/^guide\.site\./);
      expect(page.summaryKey, page.id).toMatch(/^guide\.site\./);
      expect(page.capabilityKeys.length, page.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('guide API reference', () => {
  it('documents exactly the route files under server/api', () => {
    expect(GUIDE_API.map((endpoint) => `${endpoint.method} ${endpoint.path}`).sort()).toEqual(apiEndpoints());
  });

  it('gives every endpoint a description and a group', () => {
    for (const endpoint of GUIDE_API) {
      expect(endpoint.descriptionKey, `${endpoint.method} ${endpoint.path}`).toMatch(/^guide\.api\./);
      expect(['auth', 'read', 'write', 'admin']).toContain(endpoint.group);
    }
  });
});

describe('guide MCP reference', () => {
  it('documents exactly the registered tools', () => {
    expect(GUIDE_MCP.map((tool) => tool.name).sort()).toEqual(mcpToolNames());
  });

  it('classifies exactly the tools that READ_TOOLS marks as reads', () => {
    expect(GUIDE_MCP.filter((tool) => tool.access === 'read').map((tool) => tool.name).sort()).toEqual(
      mcpReadToolNames(),
    );
  });

  it('gives every tool a description', () => {
    for (const tool of GUIDE_MCP) expect(tool.descriptionKey, tool.name).toMatch(/^guide\.mcp\./);
  });
});

describe('guide CLI reference', () => {
  it('documents only npm scripts that exist', () => {
    const scripts = packageScripts();
    for (const command of GUIDE_CLI.filter((entry) => entry.script !== null)) {
      expect(scripts, command.display).toHaveProperty(command.script!);
    }
  });

  it('documents every user-facing npm script', () => {
    const internal = new Set(['postinstall', 'format', 'test:watch', 'preview']);
    const documented = GUIDE_CLI.map((command) => command.script).filter((script): script is string => script !== null);
    expect(documented.sort()).toEqual(
      Object.keys(packageScripts())
        .filter((script) => !internal.has(script))
        .sort(),
    );
  });
});

describe('guide sources', () => {
  it('documents every sync source in catalog order, profile last', () => {
    expect(GUIDE_SOURCES.map((source) => source.id)).toEqual(syncSourceIds());
  });

  it('explains what each source updates and when it runs', () => {
    for (const source of GUIDE_SOURCES) {
      expect(source.updatesKey, source.id).toMatch(/^guide\.sources\./);
      expect(source.triggerKey, source.id).toMatch(/^guide\.sources\./);
    }
  });
});

describe('guide structure', () => {
  it('has unique ids inside each collection', () => {
    const unique = (ids: string[]): boolean => new Set(ids).size === ids.length;
    expect(unique(GUIDE_SECTIONS.map((section) => section.id))).toBe(true);
    expect(unique(GUIDE_READ_FLOW.map((step) => step.id))).toBe(true);
    expect(unique(GUIDE_WRITE_FLOW.map((step) => step.id))).toBe(true);
    expect(unique(GUIDE_PRINCIPLES.map((principle) => principle.id))).toBe(true);
  });

  it('links every site card to an existing page route', () => {
    const routes = pageRoutes();
    for (const page of GUIDE_SITE) expect(routes, page.id).toContain(page.route);
  });

  it('defines one tab per section, each with its own intro', () => {
    expect(GUIDE_SECTIONS.map((section) => section.id)).toEqual([
      'site',
      'flow',
      'api',
      'mcp',
      'cli',
      'sources',
      'principles',
    ]);
    for (const section of GUIDE_SECTIONS) {
      expect(section.introKey, section.id).toBe(`guide.sections.${section.id}.intro`);
    }
  });
});

describe('guide locale catalogs', () => {
  const en = flatten(readCatalog('en'));
  const ru = flatten(readCatalog('ru'));

  it('names every key the guide references in both locales', () => {
    for (const key of guideI18nKeys()) {
      expect(en[key], `en ${key}`).toBeTruthy();
      expect(ru[key], `ru ${key}`).toBeTruthy();
    }
  });

  it('keeps every referenced key under the guide namespace', () => {
    for (const key of guideI18nKeys()) expect(key, key).toMatch(/^guide\./);
  });
});
