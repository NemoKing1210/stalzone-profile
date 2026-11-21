import { randomUUID } from 'node:crypto';
import type { Logger } from '@profile/core';
import type { ProfileClient } from './client.js';

type AnyMethod = (...args: unknown[]) => Promise<unknown>;

export interface InstrumentOptions {
  /** Request id shared with the HTTP request and the `event_log` rows; per call when absent. */
  requestId?: string | null;
  /** Which surface asked: the built-in chat, `/mcp`, or local stdio. */
  channel?: 'chat' | 'mcp' | 'stdio';
}

/**
 * Wraps every client method with an `mcp` log entry carrying the request id.
 * Logging failures must never reach the caller, so each log call is contained.
 */
export function instrumentClient(
  client: ProfileClient,
  logger: Logger,
  options: InstrumentOptions = {},
): ProfileClient {
  const channel = options.channel ?? 'mcp';
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string' || property === 'close') return value;

      return async (...args: unknown[]) => {
        const bound = logger.child({ requestId: options.requestId ?? randomUUID() });
        const startedAt = Date.now();
        try {
          bound.debug('mcp call', { tool: property, channel, args });
        } catch {
          /* logging never breaks a tool call */
        }

        try {
          const result = await (value as AnyMethod).apply(target, args);
          try {
            const durationMs = Date.now() - startedAt;
            bound.info('mcp call', { tool: property, channel, durationMs }, undefined, durationMs);
          } catch {
            /* logging never breaks a tool call */
          }
          return result;
        } catch (error) {
          try {
            bound.error('mcp call failed', { tool: property, channel }, error);
          } catch {
            /* logging never breaks a tool call */
          }
          throw error;
        }
      };
    },
  });
}
