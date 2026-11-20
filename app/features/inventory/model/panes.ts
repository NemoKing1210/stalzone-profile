/** The left inventory column shows either the worn equipment or the selected stash. */
export type LeftPane = 'equipment' | 'stash';

export function resolvePane(value: string): LeftPane {
  return value === 'stash' ? 'stash' : 'equipment';
}

export function nextPane(current: LeftPane): LeftPane {
  return current === 'equipment' ? 'stash' : 'equipment';
}
