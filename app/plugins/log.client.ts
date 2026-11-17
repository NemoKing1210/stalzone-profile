import type { ClientLogConfig, ClientLogEntry } from '@profile/shared/contracts';
import {
  retainsPending,
  shouldCaptureConsole,
  shouldLoadConfig,
  shouldSend,
} from '~/features/logs/model/clientCapture';

const MAX_QUEUE = 50;
const FLUSH_INTERVAL_MS = 5_000;

/** Module state survives navigation, so the queue is not lost on a route change. */
let config: ClientLogConfig | null = null;
let configAt = 0;
let configLoaded = false;
let configAttemptAt = 0;
let queue: ClientLogEntry[] = [];
let sending = false;
let capturing = false;
const seen = new Map<string, number>();

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

function stackOf(error: unknown): string | null {
  return error instanceof Error ? (error.stack ?? null) : null;
}

export default defineNuxtPlugin((nuxtApp) => {
  if (!import.meta.client) return;

  async function loadConfig(): Promise<void> {
    if (!shouldLoadConfig(configLoaded, configAt, configAttemptAt, Date.now())) return;
    configAttemptAt = Date.now();
    try {
      config = await $fetch<ClientLogConfig>('/api/v1/logs/config');
      configAt = Date.now();
      configLoaded = true;
      if (!retainsPending(config)) queue = [];
      else void flush();
    } catch {
      // Keep the last good config; a never-loaded one leaves capture pending.
      // `configLoaded = false` makes the helper wait CONFIG_RETRY_MS.
      configLoaded = false;
    }
  }

  async function flush(): Promise<void> {
    if (sending || queue.length === 0 || !config || !retainsPending(config)) return;
    sending = true;
    const batch = queue.splice(0, MAX_QUEUE);
    try {
      await $fetch('/api/v1/logs/client', { method: 'POST', body: { entries: batch } });
    } catch {
      /* Dropping the batch is better than retrying forever and filling the queue. */
    } finally {
      sending = false;
    }
  }

  function capture(
    level: ClientLogEntry['level'],
    message: string,
    context?: unknown,
    stack?: string | null,
  ): void {
    if (capturing) return;
    // While the config is unknown, keep the entry: an early hydration error is
    // exactly what the owner needs, and the loaded config decides its fate.
    if (!retainsPending(config)) return;

    const entry: ClientLogEntry = {
      level,
      message,
      context,
      stack: stack ?? null,
      at: new Date().toISOString(),
    };
    if (!shouldSend(entry, seen, Date.now())) return;

    queue.push(entry);
    if (queue.length > MAX_QUEUE * 4) queue = queue.slice(-MAX_QUEUE * 4);
    if (config && (level === 'error' || queue.length >= MAX_QUEUE)) void flush();
  }

  void loadConfig();

  nuxtApp.hook('vue:error', (error, _instance, info) => {
    capture('error', messageOf(error), { info }, stackOf(error));
  });
  nuxtApp.hook('app:error', (error) => {
    capture('error', messageOf(error), {}, stackOf(error));
  });

  window.addEventListener('error', (event) => {
    if (!event.message) return;
    capture(
      'error',
      event.message,
      { filename: event.filename, line: event.lineno, column: event.colno },
      event.error instanceof Error ? (event.error.stack ?? null) : null,
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    capture('error', messageOf(event.reason), {}, stackOf(event.reason));
  });

  const nativeError = console.error.bind(console);
  const nativeWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    nativeError(...args);
    capturing = true;
    try {
      const text = args.map((arg) => (typeof arg === 'string' ? arg : messageOf(arg))).join(' ');
      if (shouldCaptureConsole(text, config?.clientConsole ?? false)) capture('error', text);
    } finally {
      capturing = false;
    }
  };
  console.warn = (...args: unknown[]) => {
    nativeWarn(...args);
    capturing = true;
    try {
      const text = args.map((arg) => (typeof arg === 'string' ? arg : messageOf(arg))).join(' ');
      if (shouldCaptureConsole(text, config?.clientConsole ?? false)) capture('warn', text);
    } finally {
      capturing = false;
    }
  };

  setInterval(() => {
    void loadConfig();
    void flush();
  }, FLUSH_INTERVAL_MS);

  window.addEventListener('pagehide', () => {
    if (queue.length === 0 || !config || !retainsPending(config)) return;
    const body = new Blob([JSON.stringify({ entries: queue.splice(0, MAX_QUEUE) })], {
      type: 'application/json',
    });
    navigator.sendBeacon('/api/v1/logs/client', body);
  });
});
