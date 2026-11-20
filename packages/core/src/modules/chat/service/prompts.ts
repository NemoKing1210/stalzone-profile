import type { Db } from '../../../platform/db/index.js';
import * as repo from '../repo/prompts.js';

const DATA_SCOPE = [
  'Only call a tool that is on the allow-list. Never invent a number: a missing lot is "no lot", a missing stat is "no data".',
  'Prices and diagnostic log excerpts are available only when the owner enabled their data-scope switches.',
  'Never buy or list on the auction; quote and advise only.',
].join(' ');

/**
 * The one prompt sent with every request: the active system prompt, then every enabled skill,
 * then the invariant rules. The composed text is deterministic, so a test can pin it.
 */
export function composeChatPrompt(db: Db): string {
  const active = repo.listActivePrompts(db);
  const system = active.filter((row) => row.kind === 'system' && row.enabled === 1);
  const skills = active.filter((row) => row.kind === 'skill' && row.enabled === 1);
  return [
    ...system.map((row) => row.body.trim()),
    ...skills.map((row) => `## ${row.name}\n${row.body.trim()}`),
    '## Rules',
    DATA_SCOPE,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export interface PromptView {
  kind: 'system' | 'skill';
  name: string;
  body: string;
  version: number;
  enabled: boolean;
  promptId: number;
}

export function activePromptViews(db: Db): PromptView[] {
  return repo.listActivePrompts(db).map((row) => ({
    kind: row.kind,
    name: row.name,
    body: row.body,
    version: row.version,
    enabled: row.enabled === 1,
    promptId: row.id,
  }));
}
