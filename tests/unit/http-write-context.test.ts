import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { H3Event } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, listEvents, logEvent, migrate, openDb, type Db } from '@profile/core';
import { handleWrite } from '../../server/utils/write';

vi.mock('../../server/utils/auth', () => ({
  requireSession: () => null,
  hasValidBearer: (event: H3Event) => event.context.bearer === true,
}));

let dir: string;
let db: Db;

function event(context: Record<string, unknown>): H3Event {
  return { context } as unknown as H3Event;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-http-write-'));
  db = openDb(path.join(dir, 'test.db'));
  migrate(db, path.join(process.cwd(), 'db', 'migrations'));
});

afterEach(() => {
  closeDb(path.join(dir, 'test.db'));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('handleWrite journal context', () => {
  it('passes the request id and labels a session write as http', () => {
    handleWrite(event({ requestId: 'req-session-1' }), () =>
      logEvent(db, { actor: 'owner', action: 'test.event', entity: 'test' }),
    );

    expect(listEvents(db)[0]).toMatchObject({ request_id: 'req-session-1', origin: 'http' });
  });

  it('labels a bearer write as api', () => {
    handleWrite(event({ requestId: 'req-api-1', bearer: true }), () =>
      logEvent(db, { actor: 'owner', action: 'test.event', entity: 'test' }),
    );

    expect(listEvents(db)[0]).toMatchObject({ request_id: 'req-api-1', origin: 'api' });
  });

  it('still stores an event when the request id is absent', () => {
    handleWrite(event({}), () => logEvent(db, { actor: 'owner', action: 'test.event', entity: 'test' }));

    expect(listEvents(db)[0]).toMatchObject({ request_id: null, origin: 'http' });
  });

  it('does not leak the context into a write outside the request', () => {
    handleWrite(event({ requestId: 'req-2' }), () =>
      logEvent(db, { actor: 'owner', action: 'test.inside', entity: 'test' }),
    );
    logEvent(db, { actor: 'owner', action: 'test.outside', entity: 'test' });

    const [outside, inside] = listEvents(db);
    expect(outside).toMatchObject({ action: 'test.outside', request_id: null, origin: null });
    expect(inside).toMatchObject({ action: 'test.inside', request_id: 'req-2', origin: 'http' });
  });
});
