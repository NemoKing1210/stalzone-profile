import { expect, test, request as playwrightRequest, type APIRequestContext } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3100';
const ORIGIN = BASE_URL;

let api: APIRequestContext;
let nervyakId: number;
let createEventId: number;

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const login = await api.post('/api/auth/login', {
    headers: { origin: ORIGIN },
    data: { password: 'e2e-password' },
  });
  expect(login.status()).toBe(200);

  const owned = await (await api.get('/api/v1/owned')).json();
  nervyakId = owned.find((row: { name: string }) => row.name === 'Нервяк').id;
});

test.afterAll(async () => {
  await api.dispose();
});

async function nervyakQty(): Promise<number> {
  const rows = await (await api.get('/api/v1/owned')).json();
  return rows.find((row: { id: number }) => row.id === nervyakId)?.qty ?? 0;
}

test('dry run reports the change without writing', async () => {
  const eventsBefore = await (await api.get('/api/v1/events')).json();
  const response = await api.post('/api/v1/owned', {
    headers: { origin: ORIGIN },
    data: { name: 'Нервяк', kind: 'artifact', level: 15, qty: 1, dryRun: true },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.dryRun).toBe(true);
  expect(body.diff.after).toMatchObject({ qty: 4, name: 'Нервяк' });
  expect(await nervyakQty()).toBe(3);

  const eventsAfter = await (await api.get('/api/v1/events')).json();
  expect(eventsAfter).toHaveLength(eventsBefore.length);
});

test('a confirmed create adds copies and logs an event', async () => {
  const response = await api.post('/api/v1/owned', {
    headers: { origin: ORIGIN },
    data: { name: 'Нервяк', kind: 'artifact', level: 15, qty: 2, dryRun: false },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  createEventId = body.eventId;
  expect(typeof createEventId).toBe('number');
  expect(await nervyakQty()).toBe(5);

  const events = await (await api.get('/api/v1/events')).json();
  expect(events[0]).toMatchObject({ id: createEventId, action: 'owned.create' });
  expect(events[0].after).toMatchObject({ qty: 5 });
});

test('update supports dry run and rollback', async () => {
  const dry = await api.patch(`/api/v1/owned/${nervyakId}`, {
    headers: { origin: ORIGIN },
    data: { qty: 1, dryRun: true },
  });
  expect((await dry.json()).diff.after).toMatchObject({ qty: 1 });
  expect(await nervyakQty()).toBe(5);

  const applied = await api.patch(`/api/v1/owned/${nervyakId}`, {
    headers: { origin: ORIGIN },
    data: { qty: 1, dryRun: false },
  });
  const appliedBody = await applied.json();
  expect(await nervyakQty()).toBe(1);

  const rollback = await api.post(`/api/v1/events/${appliedBody.eventId}/rollback`, {
    headers: { origin: ORIGIN },
    data: { dryRun: false },
  });
  expect(rollback.status()).toBe(200);
  expect(await nervyakQty()).toBe(5);
});

test('delete decrements copies and can be rolled back', async () => {
  const dry = await api.delete(`/api/v1/owned/${nervyakId}`, {
    headers: { origin: ORIGIN },
    data: { qty: 2, dryRun: true },
  });
  expect((await dry.json()).diff.after).toMatchObject({ qty: 3 });
  expect(await nervyakQty()).toBe(5);

  const applied = await api.delete(`/api/v1/owned/${nervyakId}`, {
    headers: { origin: ORIGIN },
    data: { qty: 2, dryRun: false },
  });
  const body = await applied.json();
  expect(await nervyakQty()).toBe(3);

  await api.post(`/api/v1/events/${body.eventId}/rollback`, {
    headers: { origin: ORIGIN },
    data: { dryRun: false },
  });
  expect(await nervyakQty()).toBe(5);
});

test('an unknown item returns 422 with suggestions and writes nothing', async () => {
  const response = await api.post('/api/v1/owned', {
    headers: { origin: ORIGIN },
    data: { name: 'Нервякк', kind: 'artifact', dryRun: false },
  });
  expect(response.status()).toBe(422);
  const body = await response.json();
  expect(body.error).toMatchObject({ code: 'UNKNOWN_ITEM' });
  expect(body.error.details.suggestions).toContain('Нервяк');
  expect(await nervyakQty()).toBe(5);
});

test('mutations without Origin are rejected', async () => {
  const response = await api.post('/api/v1/owned', {
    data: { name: 'Нервяк', kind: 'artifact', level: 15, qty: 1, dryRun: false },
  });
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: { code: 'ORIGIN_REQUIRED' } });
  expect(await nervyakQty()).toBe(5);
});

test('container fill is replaced and rolled back', async () => {
  const containers = await (await api.get('/api/v1/owned', { params: { kind: 'container' } })).json();
  const container = containers[0];
  const fill = await api.put(`/api/v1/containers/${container.id}/fill`, {
    headers: { origin: ORIGIN },
    data: { artifacts: [{ name: 'Нервяк', level: 15 }], dryRun: false },
  });
  expect(fill.status()).toBe(200);
  const fillBody = await fill.json();
  expect(fillBody.diff.after.artifacts).toHaveLength(1);

  let payload = await (await api.get('/api/v1/payload')).json();
  let current = payload.containers.find((row: { name: string }) => row.name === container.name);
  expect(current.artifacts).toHaveLength(1);

  await api.post(`/api/v1/events/${fillBody.eventId}/rollback`, {
    headers: { origin: ORIGIN },
    data: { dryRun: false },
  });
  payload = await (await api.get('/api/v1/payload')).json();
  current = payload.containers.find((row: { name: string }) => row.name === container.name);
  expect(current.artifacts).toHaveLength(0);
});

test('builds can be created, deleted and restored', async () => {
  const saved = await api.post('/api/v1/builds', {
    headers: { origin: ORIGIN },
    data: {
      slug: 'e2e-build',
      title: 'E2E сборка',
      rows: [{ name: 'Нервяк', quality: 'Редкий', price: 1000 }],
      dryRun: false,
    },
  });
  expect(saved.status()).toBe(200);
  const savedBody = await saved.json();
  expect(savedBody.diff.before).toBeNull();
  expect((await api.get('/api/v1/builds/e2e-build')).status()).toBe(200);

  const dry = await api.delete('/api/v1/builds/e2e-build', {
    headers: { origin: ORIGIN },
    data: { dryRun: true },
  });
  expect((await dry.json()).dryRun).toBe(true);
  expect((await api.get('/api/v1/builds/e2e-build')).status()).toBe(200);

  const removed = await api.delete('/api/v1/builds/e2e-build', {
    headers: { origin: ORIGIN },
    data: { dryRun: false },
  });
  const removedBody = await removed.json();
  expect((await api.get('/api/v1/builds/e2e-build')).status()).toBe(404);

  await api.post(`/api/v1/events/${removedBody.eventId}/rollback`, {
    headers: { origin: ORIGIN },
    data: { dryRun: false },
  });
  expect((await api.get('/api/v1/builds/e2e-build')).status()).toBe(200);

  await api.post(`/api/v1/events/${savedBody.eventId}/rollback`, {
    headers: { origin: ORIGIN },
    data: { dryRun: false },
  });
  expect((await api.get('/api/v1/builds/e2e-build')).status()).toBe(404);
});

test('content blocks are written and rolled back', async () => {
  const written = await api.put('/api/v1/content/notes', {
    headers: { origin: ORIGIN },
    data: {
      slug: 'e2e-note',
      title: 'E2E заметка',
      payload: { title: 'E2E заметка', text: 'проверка' },
      position: 99,
      dryRun: false,
    },
  });
  expect(written.status()).toBe(200);
  const body = await written.json();

  let payload = await (await api.get('/api/v1/payload')).json();
  expect(payload.notes.some((note: { title: string }) => note.title === 'E2E заметка')).toBe(true);

  await api.post(`/api/v1/events/${body.eventId}/rollback`, {
    headers: { origin: ORIGIN },
    data: { dryRun: false },
  });
  payload = await (await api.get('/api/v1/payload')).json();
  expect(payload.notes.some((note: { title: string }) => note.title === 'E2E заметка')).toBe(false);
});

test('character edits are validated and rolled back', async () => {
  const before = await (await api.get('/api/v1/character')).json();
  const dry = await api.patch('/api/v1/character', {
    headers: { origin: ORIGIN },
    data: { hours: 777, dryRun: true },
  });
  expect((await dry.json()).diff.after).toMatchObject({ hours: 777 });
  expect((await (await api.get('/api/v1/character')).json()).hours).toBe(before.hours);

  const applied = await api.patch('/api/v1/character', {
    headers: { origin: ORIGIN },
    data: { hours: 777, dryRun: false },
  });
  const body = await applied.json();
  expect((await (await api.get('/api/v1/character')).json()).hours).toBe(777);

  await api.post(`/api/v1/events/${body.eventId}/rollback`, {
    headers: { origin: ORIGIN },
    data: { dryRun: false },
  });
  expect((await (await api.get('/api/v1/character')).json()).hours).toBe(before.hours);
});

test('export returns the legacy dossier shape', async () => {
  const response = await api.get('/api/v1/admin/export');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.weapons).toHaveLength(35);
  expect(body.artifacts).toHaveLength((await (await api.get('/api/v1/payload')).json()).artifacts.length);
  expect(Object.keys(body.details)).toHaveLength(601);
});

test('the create event restores the original quantity', async () => {
  await api.post(`/api/v1/events/${createEventId}/rollback`, {
    headers: { origin: ORIGIN },
    data: { dryRun: false },
  });
  expect(await nervyakQty()).toBe(3);
});
