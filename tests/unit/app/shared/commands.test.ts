import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PALETTE_ROUTES,
  filterPaletteCommands,
  groupPaletteCommands,
  matchesPaletteCommand,
  paletteCommands,
  type PaletteContext,
} from '~/shared/lib/commands';
import {
  isTextField,
  normalizePaletteShortcut,
  paletteShortcutEnabled,
  readPaletteShortcut,
} from '~/shared/lib/paletteShortcut';

const context: PaletteContext = {
  t: (key) => key,
  counts: { weapons: 3, armor: 2, containers: 1, artifacts: 4, modifications: 5, inventory: 10, devices: 17 },
  stashes: [
    { id: 2, name: 'Stash', count: 5 },
    { id: 7, name: 'Ammo', count: 0 },
  ],
  theme: 'dark',
  locale: 'en',
  density: 'comfortable',
};

function pageRoutes(): string[] {
  return fs
    .readdirSync(path.join(process.cwd(), 'app/pages'))
    .filter((file) => file.endsWith('.vue'))
    .map((file) => (file === 'index.vue' ? '/' : `/${file.slice(0, -'.vue'.length)}`))
    .sort();
}

describe('command palette registry', () => {
  it('maps every navigation entry to a real page route', () => {
    const routes = pageRoutes();
    const commands = paletteCommands(context);
    for (const route of PALETTE_ROUTES) expect(routes, route).toContain(route);
    for (const command of commands) {
      const target = command.to?.split('?')[0];
      if (target) expect(routes, command.id).toContain(target);
    }
  });

  it('has unique ids, a label, an icon and one group', () => {
    const commands = paletteCommands(context);
    expect(new Set(commands.map((command) => command.id)).size).toBe(commands.length);
    for (const command of commands) {
      expect(command.label.trim(), command.id).not.toBe('');
      expect(command.icon, command.id).toMatch(/^i-lucide-/);
      expect(['navigate', 'character', 'data', 'items', 'appearance', 'stashes']).toContain(command.group);
    }
  });

  it('marks every profile write as confirmed and never confirms a local choice', () => {
    const commands = paletteCommands(context).filter((command) => command.write || command.confirm);
    expect(commands.map((command) => command.id).sort()).toEqual([
      'character.max-money',
      'character.money',
      'data.sync-profile',
      'items.add',
    ]);
    for (const command of commands) {
      expect(command.write, command.id).toBe(true);
      expect(command.confirm, command.id).toBe(true);
    }
  });

  it('offers the assistant panel command without a write or a route', () => {
    const command = paletteCommands(context).find((entry) => entry.action === 'open-assistant');
    expect(command).toMatchObject({ id: 'assistant.open', group: 'data', icon: 'i-lucide-sparkles' });
    expect(command?.write).toBeUndefined();
    expect(command?.confirm).toBeUndefined();
    expect(command?.to).toBeUndefined();
  });

  it('offers one stash command per storage and no dead stash id', () => {
    const stashCommands = paletteCommands(context).filter((command) => command.action === 'select-stash');
    expect(stashCommands.map((command) => command.stashId)).toEqual([2, 7]);
    expect(stashCommands.every((command) => command.to === `/inventory?stash=${command.stashId}`)).toBe(true);
  });

  it('groups commands in a fixed order and drops empty groups', () => {
    const groups = groupPaletteCommands(paletteCommands({ ...context, stashes: [] }), (key) => key);
    expect(groups.map((group) => group.id)).toEqual([
      'navigate',
      'character',
      'data',
      'items',
      'appearance',
    ]);
    for (const group of groups) {
      expect(group.items.length).toBeGreaterThan(0);
      expect(group.label).toMatch(/^palette\.groups\./);
    }
  });
});

describe('command palette filtering', () => {
  const commands = paletteCommands(context);

  it('matches a subsequence across the label and keywords', () => {
    expect(filterPaletteCommands(commands, 'weap').some((command) => command.id === 'nav.weapons')).toBe(true);
    expect(filterPaletteCommands(commands, 'money').some((command) => command.id === 'character.money')).toBe(true);
    expect(filterPaletteCommands(commands, 'cash').some((command) => command.id === 'character.money')).toBe(true);
    expect(filterPaletteCommands(commands, '')).toHaveLength(commands.length);
  });

  it('requires every token and returns nothing for a miss', () => {
    expect(matchesPaletteCommand(commands[0]!, 'overview nav')).toBe(true);
    expect(filterPaletteCommands(commands, 'zzzz')).toEqual([]);
  });
});

describe('command palette shortcut', () => {
  it('normalises a stored value and defaults to both bindings', () => {
    expect(normalizePaletteShortcut('ctrl-k')).toBe('ctrl-k');
    expect(normalizePaletteShortcut('nonsense')).toBe('both');
    expect(readPaletteShortcut(null)).toBe('both');
  });

  it('honours the chosen binding', () => {
    expect(paletteShortcutEnabled('both', 'space')).toBe(true);
    expect(paletteShortcutEnabled('both', 'k')).toBe(true);
    expect(paletteShortcutEnabled('ctrl-space', 'space')).toBe(true);
    expect(paletteShortcutEnabled('ctrl-space', 'k')).toBe(false);
    expect(paletteShortcutEnabled('ctrl-k', 'space')).toBe(false);
    expect(paletteShortcutEnabled('ctrl-k', 'k')).toBe(true);
  });

  it('recognises a focused text field but not a button', () => {
    expect(isTextField({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTextField({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTextField({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});
