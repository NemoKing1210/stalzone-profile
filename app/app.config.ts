export default defineAppConfig({
  ui: {
    colors: {
      primary: 'zone',
      neutral: 'ink',
    },
    button: {
      slots: {
        base: 'rounded-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      },
    },
    input: {
      slots: {
        base: 'rounded-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary',
      },
    },
    progress: {
      slots: {
        base: 'rounded-none h-[3px] bg-[var(--sz-surface-header)]',
        indicator: 'rounded-none',
      },
    },
    table: {
      slots: {
        th: 'h-8 whitespace-nowrap bg-[var(--sz-surface-header)] px-2.5 py-0 text-[11px] font-medium uppercase tracking-[0.13em] text-[var(--sz-text-muted)]',
        td: 'px-2.5 py-1.5 text-[12.5px] text-[var(--sz-text)]',
        tr: 'transition-colors hover:bg-zone-500/5 data-[selected=true]:bg-zone-500/10',
        tbody: 'divide-y divide-[var(--sz-border)]',
      },
    },
  },
});
