import { randomUUID } from 'node:crypto';
import type { Logger } from '@profile/core';
import type { ProfileClient } from './client.js';

type AnyMethod = (...args: unknown[]) => Promise<unknown>;

/**
 * Wraps every client method with an `mcp` log entry carrying its own request id.
 * Logging failures must never reach the caller, so each log call is contained.
 */
export function instrumentClient(client: ProfileClient, logger: Logger): ProfileClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string' || property === 'close') return value;

      return async (...args: unknown[]) => {
        const bound = logger.child({ requestId: randomUUID() });
        const startedAt = Date.now();
        try {
          bound.debug('mcp call', { tool: property, args });
        } catch {
          /* logging never breaks a tool call */
        }

        try {
          const result = await (value as AnyMethod).apply(target, args);
          try {
            const durationMs = Date.now() - startedAt;
            bound.info('mcp call', { tool: property, durationMs }, undefined, durationMs);
          } catch {
            /* logging never breaks a tool call */
          }
          return result;
        } catch (error) {
          try {
            bound.error('mcp call failed', { tool: property }, error);
          } catch {
            /* logging never breaks a tool call */
          }
          throw error;
        }
      };
    },
  });
}
