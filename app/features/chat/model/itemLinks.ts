import type { ItemModalTarget } from '~/shared/lib/itemModal';

/**
 * The item a chip click names, read from its data attributes. Modified and non-primary
 * clicks return null so the browser keeps copy, new-tab and context-menu behaviour.
 */
export function chatItemFromEvent(event: MouseEvent): ItemModalTarget | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a.sz-chat-ref');
  if (!anchor) return null;
  const kind = anchor.dataset.itemKind;
  const name = anchor.dataset.itemName;
  if (!kind || !name) return null;
  const instanceId = Number(anchor.dataset.itemInstance);
  if (anchor.dataset.itemInstance && Number.isInteger(instanceId) && instanceId > 0) {
    return { mode: 'instance', instanceId, kind };
  }
  return {
    mode: 'catalog',
    kind,
    name,
    icon: anchor.dataset.itemIcon ?? null,
    rank: anchor.dataset.itemRank ?? null,
    category: null,
  };
}
