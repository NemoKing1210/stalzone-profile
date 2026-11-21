import { CHAT_ENV_VAR_NAME } from '@profile/shared/contracts';

export const ASSISTANT_MODE_KEY = 'profile:settings:assistant-mode';

export type AssistantMode = 'basic' | 'advanced';

/** The five settings blocks, in render order. */
export const ASSISTANT_BLOCK_KEYS = ['connection', 'generation', 'reliability', 'dataScope', 'prompts'] as const;
export type AssistantBlockKey = (typeof ASSISTANT_BLOCK_KEYS)[number];

export interface AssistantBlock {
  key: AssistantBlockKey;
  open: boolean;
}

export function parseAssistantMode(raw: string | null | undefined): AssistantMode {
  return raw === 'advanced' ? 'advanced' : 'basic';
}

interface ModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isModeStorage(value: unknown): value is ModeStorage {
  return (
    value != null &&
    typeof value === 'object' &&
    'getItem' in value &&
    typeof value.getItem === 'function' &&
    'setItem' in value &&
    typeof value.setItem === 'function'
  );
}

function browserStorage(): ModeStorage | null {
  try {
    const candidate = Reflect.get(globalThis, 'localStorage');
    return isModeStorage(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/** Read after mount, so SSR always renders Basic and hydration cannot disagree. */
export function readAssistantMode(storage: ModeStorage | null = browserStorage()): AssistantMode {
  try {
    return parseAssistantMode(storage?.getItem(ASSISTANT_MODE_KEY));
  } catch {
    return 'basic';
  }
}

export function writeAssistantMode(mode: AssistantMode, storage: ModeStorage | null = browserStorage()): void {
  try {
    storage?.setItem(ASSISTANT_MODE_KEY, mode);
  } catch {
    // A blocked localStorage (private mode, quota) keeps the choice for this session only.
  }
}

/**
 * The blocks a mode renders: Basic is the minimum Connection block, Advanced is all five
 * with only Connection open on first render.
 */
export function assistantBlocks(mode: AssistantMode): AssistantBlock[] {
  if (mode === 'basic') return [{ key: 'connection', open: true }];
  return ASSISTANT_BLOCK_KEYS.map((key) => ({ key, open: key === 'connection' }));
}

/** An absolute http(s) URL; a custom endpoint must pass this before the form can save. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The base URL the form should persist: null (the provider default) unless the owner asked
 * for a custom endpoint and typed one.
 */
export function baseUrlFor(custom: boolean, value: string): string | null {
  const trimmed = value.trim();
  return custom && trimmed !== '' ? trimmed : null;
}

/** The key field holds a variable name; a pasted secret fails this and is never saved. */
export function isEnvVarName(value: string): boolean {
  return CHAT_ENV_VAR_NAME.test(value);
}
