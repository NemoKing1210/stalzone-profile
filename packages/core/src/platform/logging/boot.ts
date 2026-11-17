import type { LogLevel } from '@profile/shared/contracts';
import { shouldLog } from './levels.js';

const ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function bootLevel(): LogLevel | 'off' {
  const raw = (process.env.LOG_BOOT_LEVEL ?? 'warn').toLowerCase();
  if (raw === 'disable' || raw === 'off' || raw === 'silent') return 'off';
  return (ORDER as string[]).includes(raw) ? (raw as LogLevel) : 'warn';
}

/** Pre-database logging: stdout only, controlled by `LOG_BOOT_LEVEL` and `LOG_BOOT_STDOUT`. */
export function bootLog(level: LogLevel, message: string, error?: unknown): void {
  const threshold = bootLevel();
  if (threshold === 'off') return;
  if (!shouldLog(level, threshold)) return;
  if ((process.env.LOG_BOOT_STDOUT ?? '1') === '0') return;

  const suffix = error instanceof Error ? `: ${error.message}` : error == null ? '' : `: ${String(error)}`;
  const line = `[${level}] [boot] ${message}${suffix}`;
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}
