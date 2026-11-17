import { randomUUID } from 'node:crypto';
import { getLogger, initLogging, startRetentionTimer } from '@profile/core';
import { useDb } from '../utils/db';
import { httpLogLevel, shouldLogHttpPath } from '../utils/http-log';
import { logAt, requestLogger } from '../utils/log';

export default defineNitroPlugin((nitroApp) => {
  const db = useDb();
  initLogging(db, { source: 'server', processHooks: true });
  startRetentionTimer(db);

  nitroApp.hooks.hook('request', (event) => {
    event.context.requestId = randomUUID();
    event.context.logStartedAt = performance.now();
    setResponseHeader(event, 'x-request-id', event.context.requestId as string);
  });

  nitroApp.hooks.hook('afterResponse', (event) => {
    const path = getRequestURL(event).pathname;
    if (!shouldLogHttpPath(path)) return;
    const durationMs = Math.round(performance.now() - Number(event.context.logStartedAt ?? performance.now()));
    const status = getResponseStatus(event);
    const level = httpLogLevel(status, durationMs);
    logAt(requestLogger(event, 'http'), level, `${event.method} ${path} ${status}`, { status, path, durationMs }, durationMs);
  });

  nitroApp.hooks.hook('error', (error, { event }) => {
    if (!event) {
      getLogger(db, 'app').error('nitro error without a request', {}, error);
      return;
    }
    const path = getRequestURL(event).pathname;
    requestLogger(event, 'http').error(`${event.method} ${path}`, {}, error);
  });
});
