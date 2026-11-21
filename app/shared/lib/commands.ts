import { norm } from '@profile/shared/format';

import type { NavCounts } from './nav';

/** What choosing a command does. Navigation-only entries carry a `to` and no action. */
export type PaletteCommandAction =
  | 'edit-character'
  | 'sync-profile'
  | 'add-item'
  | 'toggle-theme'
  | 'toggle-locale'
  | 'toggle-density'
  | 'open-assistant'
  | 'select-stash';

export type PaletteGroup = 'navigate' | 'character' | 'data' | 'items' | 'appearance' | 'stashes';

export interface PaletteCommand {
  id: string;
  group: PaletteGroup;
  /** Already translated: the registry is built from `t` at render time. */
  label: string;
  icon: string;
  keywords?: string;
  /** The route a command opens; actions carry it too so the palette can close and move. */
  to?: string;
  action?: PaletteCommandAction;
  count?: number | null;
  stashId?: number;
  /** A command that changes profile data, never a local preference. */
  write?: boolean;
  /** A write command that must ask before running (modal form or confirm dialog). */
  confirm?: boolean;
}

export interface StashCommandSource {
  id: number;
  name: string;
  count: number;
}

export interface PaletteContext {
  t: (key: string) => string;
  counts: NavCounts;
  stashes: readonly StashCommandSource[];
  theme: 'dark' | 'light';
  locale: 'en' | 'ru';
  density: 'comfortable' | 'compact';
}

export const PALETTE_GROUP_ORDER: readonly PaletteGroup[] = [
  'navigate',
  'character',
  'data',
  'items',
  'appearance',
  'stashes',
];

/** Every navigation target the registry uses; the test checks each against `app/pages`. */
export const PALETTE_ROUTES = [
  '/',
  '/inventory',
  '/weapons',
  '/devices',
  '/armor',
  '/containers',
  '/artifacts',
  '/changelog',
  '/guide',
  '/settings',
  '/logs',
] as const;

export function paletteCommands(context: PaletteContext): PaletteCommand[] {
  const { t, counts, stashes, theme, locale, density } = context;
  const navigation: { id: string; to: string; labelKey: string; icon: string; count?: number | null }[] = [
    { id: 'nav.overview', to: '/', labelKey: 'nav.overview', icon: 'i-lucide-house' },
    { id: 'nav.inventory', to: '/inventory', labelKey: 'nav.inventory', icon: 'i-lucide-package', count: counts.inventory },
    { id: 'nav.weapons', to: '/weapons', labelKey: 'nav.weapons', icon: 'i-lucide-crosshair', count: counts.weapons },
    { id: 'nav.devices', to: '/devices', labelKey: 'nav.devices', icon: 'i-lucide-radar', count: counts.devices },
    { id: 'nav.armor', to: '/armor', labelKey: 'nav.armor', icon: 'i-lucide-shield', count: counts.armor },
    { id: 'nav.containers', to: '/containers', labelKey: 'nav.containers', icon: 'i-lucide-backpack', count: counts.containers },
    { id: 'nav.artifacts', to: '/artifacts', labelKey: 'nav.artifacts', icon: 'i-lucide-gem', count: counts.artifacts },
    { id: 'nav.changelog', to: '/changelog', labelKey: 'nav.changelog', icon: 'i-lucide-scroll-text' },
    { id: 'nav.guide', to: '/guide', labelKey: 'nav.guide', icon: 'i-lucide-map' },
    { id: 'nav.settings', to: '/settings', labelKey: 'nav.settings', icon: 'i-lucide-settings' },
    { id: 'nav.logs', to: '/logs', labelKey: 'nav.logs', icon: 'i-lucide-bug' },
  ];

  return [
    ...navigation.map((entry) => ({
      id: entry.id,
      group: 'navigate' as const,
      label: t(entry.labelKey),
      icon: entry.icon,
      to: entry.to,
      count: entry.count ?? null,
    })),
    {
      id: 'character.money',
      group: 'character',
      label: t('palette.editMoney'),
      icon: 'i-lucide-wallet',
      keywords: 'money cash caps',
      to: '/?edit=money',
      action: 'edit-character',
      write: true,
      confirm: true,
    },
    {
      id: 'character.max-money',
      group: 'character',
      label: t('palette.editMaxMoney'),
      icon: 'i-lucide-badge-dollar-sign',
      keywords: 'max money caps limit',
      to: '/?edit=maxMoney',
      action: 'edit-character',
      write: true,
      confirm: true,
    },
    {
      id: 'data.sync-profile',
      group: 'data',
      label: t('palette.syncProfile'),
      icon: 'i-lucide-refresh-cw',
      keywords: 'sync profile api refresh',
      action: 'sync-profile',
      write: true,
      confirm: true,
    },
    {
      id: 'items.add',
      group: 'items',
      label: t('palette.addItem'),
      icon: 'i-lucide-plus',
      keywords: 'create item gear add',
      to: '/weapons?add=1',
      action: 'add-item',
      write: true,
      confirm: true,
    },
    {
      id: 'assistant.open',
      group: 'data',
      label: t('palette.openAssistant'),
      icon: 'i-lucide-sparkles',
      keywords: 'assistant chat ai panel',
      action: 'open-assistant',
    },
    {
      id: 'appearance.theme',
      group: 'appearance',
      label: theme === 'dark' ? t('palette.themeLight') : t('palette.themeDark'),
      icon: theme === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
      keywords: 'theme dark light appearance',
      action: 'toggle-theme',
    },
    {
      id: 'appearance.locale',
      group: 'appearance',
      label: locale === 'ru' ? t('palette.localeEn') : t('palette.localeRu'),
      icon: 'i-lucide-languages',
      keywords: 'language locale english russian',
      action: 'toggle-locale',
    },
    {
      id: 'appearance.density',
      group: 'appearance',
      label: density === 'compact' ? t('palette.densityComfortable') : t('palette.densityCompact'),
      icon: 'i-lucide-rows-3',
      keywords: 'density compact comfortable rows',
      action: 'toggle-density',
    },
    ...stashes.map((stash) => ({
      id: `stash.${stash.id}`,
      group: 'stashes' as const,
      label: stash.name,
      icon: 'i-lucide-archive',
      keywords: 'stash storage tab',
      to: `/inventory?stash=${stash.id}`,
      action: 'select-stash' as const,
      stashId: stash.id,
      count: stash.count,
    })),
  ];
}

const GROUP_LABEL_KEYS: Record<PaletteGroup, string> = {
  navigate: 'palette.groups.navigate',
  character: 'palette.groups.character',
  data: 'palette.groups.data',
  items: 'palette.groups.items',
  appearance: 'palette.groups.appearance',
  stashes: 'palette.groups.stashes',
};

export interface PaletteGroupView {
  id: PaletteGroup;
  label: string;
  items: PaletteCommand[];
}

/** Groups in a fixed order; empty groups are dropped so the list has no dead headings. */
export function groupPaletteCommands(
  commands: readonly PaletteCommand[],
  t: (key: string) => string,
): PaletteGroupView[] {
  return PALETTE_GROUP_ORDER.flatMap((group) => {
    const items = commands.filter((command) => command.group === group);
    return items.length ? [{ id: group, label: t(GROUP_LABEL_KEYS[group]), items }] : [];
  });
}

function subsequence(haystack: string, needle: string): boolean {
  let index = 0;
  for (const char of needle) {
    index = haystack.indexOf(char, index);
    if (index < 0) return false;
    index += 1;
  }
  return true;
}

/** Every whitespace-separated token must be a subsequence of the command's searchable text. */
export function matchesPaletteCommand(command: PaletteCommand, query: string): boolean {
  const tokens = norm(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const haystack = norm(`${command.label} ${command.keywords ?? ''} ${command.id}`);
  return tokens.every((token) => subsequence(haystack, token));
}

export function filterPaletteCommands(commands: readonly PaletteCommand[], query: string): PaletteCommand[] {
  return commands.filter((command) => matchesPaletteCommand(command, query));
}
