/**
 * Page-level tab strips (`/settings`, `/guide`): one full-width row with a hairline border,
 * and the nav's 2 px accent underline under the active tab. Shared so the two screens never
 * drift apart; the underline is the sliding UTabs indicator, not a per-trigger pseudo.
 */
export const TAB_STRIP_UI = {
  root: 'gap-0',
  list: 'gap-0 overflow-x-auto overflow-y-clip [overflow-clip-margin:1px] border-b border-[var(--sz-border)]',
  indicator: 'bottom-0 h-0.5 rounded-none bg-[var(--sz-accent)]',
  trigger:
    'sz-caps shrink-0 rounded-none px-3 py-2.5 text-[var(--sz-text-muted)] hover:text-[var(--sz-text)] data-[state=active]:text-[var(--sz-text)]',
  content: 'p-0 pt-4',
} as const;
