export type AccentId = 'green' | 'amber' | 'blue' | 'violet' | 'bone';

export interface AccentPreset {
  id: AccentId;
  hex: string;
  hover: string;
  pressed: string;
  labelKey: string;
}

export const DEFAULT_ACCENT: AccentId = 'green';

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: 'green', hex: '#63b356', hover: '#74c466', pressed: '#4f9945', labelKey: 'accents.green' },
  { id: 'amber', hex: '#e0a63c', hover: '#ebc15e', pressed: '#c98f2c', labelKey: 'accents.amber' },
  { id: 'blue', hex: '#4a9fd8', hover: '#6fb5e4', pressed: '#3487be', labelKey: 'accents.blue' },
  { id: 'violet', hex: '#b78bd6', hover: '#c9a6e3', pressed: '#9d6ebd', labelKey: 'accents.violet' },
  { id: 'bone', hex: '#d8d8d3', hover: '#ece7e1', pressed: '#bfbfb9', labelKey: 'accents.bone' },
];

export function normalizeAccent(value: unknown): AccentId {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ACCENT_PRESETS.some((preset) => preset.id === id) ? (id as AccentId) : DEFAULT_ACCENT;
}
