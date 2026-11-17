import crypto from 'node:crypto';
import type { LogCategory, LogLevel } from '@profile/shared/contracts';

function firstStackLine(stack: string | null | undefined): string {
  if (!stack) return '';
  return stack
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !/^at\s/.test(line)) ?? '';
}

/** Stable identity of a repeated defect: level, category, normalized message, first stack line. */
export function fingerprintOf(
  level: LogLevel,
  category: LogCategory,
  message: string,
  stack: string | null | undefined,
): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha1').update([level, category, normalized, firstStackLine(stack)].join('\n')).digest('hex');
}
