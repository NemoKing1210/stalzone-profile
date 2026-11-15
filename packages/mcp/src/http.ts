import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { DossierClient } from './client.js';
import { createDossierServer, writeLimiter, type WriteLimiter } from './registry.js';

export interface McpHttpOptions {
  client: DossierClient;
  token: string | null;
  writesPerMinute?: number;
  limiter?: WriteLimiter;
  maxBodyBytes?: number;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const candidate = match?.[1]?.trim() ?? '';
  const left = Buffer.from(candidate);
  const right = Buffer.from(token);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > maxBytes) throw new Error('BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return undefined;
  return JSON.parse(text) as unknown;
}

/**
 * Stateless Streamable HTTP handler for `/mcp`. A fresh server and transport serve each
 * request (the SDK's stateless pattern), while the write limiter is shared across requests.
 */
export function createMcpHttpHandler(options: McpHttpOptions) {
  const limiter = options.limiter ?? writeLimiter(options.writesPerMinute ?? 30);
  const maxBodyBytes = options.maxBodyBytes ?? 2 * 1024 * 1024;

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!options.token) {
      res.statusCode = 404;
      res.end();
      return;
    }
    if (!authorized(req, options.token)) {
      sendJson(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Требуется Bearer-токен MCP' } });
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      res.statusCode = 405;
      res.end();
      return;
    }

    let body: unknown;
    try {
      body = await readJson(req, maxBodyBytes);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'BODY_TOO_LARGE';
      sendJson(res, tooLarge ? 413 : 400, {
        error: {
          code: tooLarge ? 'BODY_TOO_LARGE' : 'INVALID_JSON',
          message: tooLarge ? 'Тело запроса слишком большое' : 'Некорректный JSON',
        },
      });
      return;
    }

    const server = createDossierServer(options.client, { limiter });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.once('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: { code: 'MCP_ERROR', message: error instanceof Error ? error.message : 'Ошибка MCP' },
        });
      } else {
        res.end();
      }
    }
  };
}
