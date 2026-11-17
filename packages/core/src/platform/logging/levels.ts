import type { LogCategory, LogLevel, LogLevelOrOff } from '@profile/shared/contracts';
import type { EffectiveLoggingSettings } from './types.js';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function resolveLevel(
  settings: Pick<EffectiveLoggingSettings, 'minLevel' | 'levels'>,
  category: LogCategory,
): LogLevelOrOff {
  return settings.levels[category] ?? settings.minLevel;
}

export function shouldLog(level: LogLevel, effective: LogLevelOrOff): boolean {
  if (effective === 'off') return false;
  return ORDER[level] >= ORDER[effective];
}
