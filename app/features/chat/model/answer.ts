import type { ChatChartData } from './chart';
import { chatToolView, type ChatItemView, type ChatPriceView } from './render';
import type { ChatToolRunView } from './rows';

/** Everything the answer panel shows: cards, one chart, prices and a plain text answer. */
export interface ChatAnswerData {
  items: ChatItemView[];
  chart: ChatChartData | null;
  prices: ChatPriceView[];
  text: string[];
}

function itemKey(item: ChatItemView): string {
  return item.instanceId != null ? `instance:${item.instanceId}` : `catalog:${item.kind ?? ''}:${item.name}`;
}

/** A later row with a real instance or a level is worth more than a bare catalog summary. */
function richer(next: ChatItemView, current: ChatItemView): boolean {
  if (next.instanceId != null && current.instanceId == null) return true;
  return next.level != null && current.level == null;
}

/** A compare row proves the metric but omits category, weight and icon; fill those from search. */
function merged(base: ChatItemView | undefined, item: ChatItemView): ChatItemView {
  if (!base) return item;
  return {
    ...base,
    ...item,
    rank: item.rank ?? base.rank,
    kind: item.kind ?? base.kind,
    category: item.category ?? base.category,
    icon: item.icon ?? base.icon,
    level: item.level ?? base.level,
    qty: item.qty ?? base.qty,
    virtual: item.virtual || base.virtual,
    location: item.location ?? base.location,
    weight: item.weight ?? base.weight,
  };
}

/**
 * Folds one turn's tool runs into the owner-facing answer. Items keep their first-seen order
 * and are deduplicated; a compare_items chart beats a longer find_items chart because it is
 * the shortlist the answer talks about.
 */
export function chatAnswer(runs: readonly ChatToolRunView[]): ChatAnswerData {
  const items = new Map<string, ChatItemView>();
  /** A named shortlist is the answer's subject; a broad search only backs it. */
  const compared = new Map<string, ChatItemView>();
  const prices: ChatPriceView[] = [];
  const text: string[] = [];
  let chart: ChatChartData | null = null;
  for (const run of runs) {
    if (run.status !== 'ok') continue;
    const view = chatToolView(run.name, run.payload);
    if (view.kind === 'items') {
      const target = run.name === 'compare_items' ? compared : items;
      for (const item of view.items) {
        const key = itemKey(item);
        const current = target.get(key);
        if (!current || richer(item, current)) target.set(key, item);
      }
      if (view.chart && (!chart || run.name === 'compare_items')) chart = view.chart;
      continue;
    }
    if (view.kind === 'prices') {
      prices.push(...view.prices);
      continue;
    }
    if (view.kind === 'text' && view.text !== '—') text.push(view.text);
  }
  const chosen = compared.size
    ? [...compared.values()].map((item) => merged(items.get(itemKey(item)), item))
    : [...items.values()];
  return { items: chosen, chart, prices, text };
}
