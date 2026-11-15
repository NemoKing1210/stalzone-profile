import { expect, test, request as playwrightRequest, type APIRequestContext } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3100';
const ORIGIN = BASE_URL;

let api: APIRequestContext;

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const login = await api.post('/api/auth/login', {
    headers: { origin: ORIGIN },
    data: { password: 'e2e-password' },
  });
  expect(login.status()).toBe(200);
});

test.afterAll(async () => {
  await api.dispose();
});

test('anonymous API calls are rejected with the standard envelope', async () => {
  const anon = await playwrightRequest.newContext({ baseURL: BASE_URL });
  try {
    const response = await anon.get('/api/v1/payload');
    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  } finally {
    await anon.dispose();
  }
});

test('payload returns the dossier counts and is not cached', async () => {
  const response = await api.get('/api/v1/payload');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('private, no-store');
  const body = await response.json();
  expect(body.weapons).toHaveLength(35);
  expect(body.armor).toHaveLength(12);
  expect(body.containers).toHaveLength(3);
  expect(body.artifacts).toHaveLength(22);
  expect(Object.keys(body.details)).toHaveLength(601);
});

test('payload icon paths resolve to local webp files', async () => {
  const response = await api.get('/api/v1/payload');
  const body = await response.json();
  const icon: string = body.weapons[0].icon;
  expect(icon).toMatch(/^\/icons\/[a-f0-9]{40}\.webp$/);

  const file = await api.get(icon);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toContain('image/webp');
  const bytes = await file.body();
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
});

test('character exposes the owner profile', async () => {
  const response = await api.get('/api/v1/character');
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ nick: expect.any(String), realm: expect.any(String) });
});

test('items search validates filters and returns matches', async () => {
  const response = await api.get('/api/v1/items', { params: { q: 'АК', kind: 'weapon', limit: '5' } });
  expect(response.status()).toBe(200);
  const items = await response.json();
  expect(Array.isArray(items)).toBe(true);
  expect(items.length).toBeLessThanOrEqual(5);
  expect(items[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String), kind: 'weapon' });

  const bad = await api.get('/api/v1/items', { params: { kind: 'banana' } });
  expect(bad.status()).toBe(400);
  await expect(bad.json()).resolves.toMatchObject({ error: { code: 'VALIDATION' } });
});

test('item detail returns stats and a legacy card', async () => {
  const search = await api.get('/api/v1/items', { params: { q: 'АК-12', kind: 'weapon', limit: '1' } });
  const [first] = await search.json();
  expect(first).toBeTruthy();

  const response = await api.get(`/api/v1/items/${first.id}`);
  expect(response.status()).toBe(200);
  const item = await response.json();
  expect(item).toMatchObject({ id: first.id, name: expect.any(String), kind: 'weapon' });
  expect(Array.isArray(item.stats)).toBe(true);
  expect(item.stats.length).toBeGreaterThan(0);

  const missing = await api.get('/api/v1/items/999999');
  expect(missing.status()).toBe(404);
  await expect(missing.json()).resolves.toMatchObject({ error: { code: 'ITEM_NOT_FOUND' } });

  const malformed = await api.get('/api/v1/items/abc');
  expect(malformed.status()).toBe(400);
});

test('owned rows keep quantity and legacy extras', async () => {
  const response = await api.get('/api/v1/owned');
  expect(response.status()).toBe(200);
  const rows = await response.json();
  expect(rows).toHaveLength(69);
  const nervyak = rows.filter((row: { name: string }) => row.name === 'Нервяк');
  expect(nervyak).toHaveLength(1);
  expect(nervyak[0].qty).toBe(3);

  const weapons = await api.get('/api/v1/owned', { params: { kind: 'weapon' } });
  await expect(weapons.json()).resolves.toHaveLength(34);
});

test('containers and builds are exposed', async () => {
  const containers = await api.get('/api/v1/containers');
  expect(containers.status()).toBe(200);
  await expect(containers.json()).resolves.toHaveLength(3);

  const builds = await api.get('/api/v1/builds');
  expect(builds.status()).toBe(200);
  const body = await builds.json();
  expect(body.items).toHaveLength(5);

  const slug = body.items[0].id;
  const build = await api.get(`/api/v1/builds/${slug}`);
  expect(build.status()).toBe(200);
  await expect(build.json()).resolves.toMatchObject({ id: slug });

  const missing = await api.get('/api/v1/builds/not-a-build');
  expect(missing.status()).toBe(404);
  await expect(missing.json()).resolves.toMatchObject({ error: { code: 'BUILD_NOT_FOUND' } });
});

test('prices are grouped by requested name', async () => {
  const response = await api.get('/api/v1/prices', { params: { names: 'Нервяк' } });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Object.keys(body)).toContain('Нервяк');
  expect(Array.isArray(body['Нервяк'])).toBe(true);
});

test('sources, meta and events are readable', async () => {
  const sources = await api.get('/api/v1/sources');
  expect(sources.status()).toBe(200);
  const list = await sources.json();
  expect(list.map((source: { id: string }) => source.id)).toEqual(
    expect.arrayContaining(['exbo_base', 'wiki', 'scpmodel']),
  );

  const meta = await api.get('/api/v1/meta');
  expect(meta.status()).toBe(200);
  await expect(meta.json()).resolves.toMatchObject({ meta: expect.any(Object), freshness: expect.any(Object) });

  const events = await api.get('/api/v1/events');
  expect(events.status()).toBe(200);
  await expect(events.json()).resolves.toEqual([]);
});

test('details and catalog expose exact legacy keys', async () => {
  const key = 'art:Нервяк';
  const detail = await api.get(`/api/v1/details/${encodeURIComponent(key)}`);
  expect(detail.status()).toBe(200);
  await expect(detail.json()).resolves.toMatchObject({ key, kind: 'artifact', name: 'Нервяк' });

  const missing = await api.get(`/api/v1/details/${encodeURIComponent('art:Нет такого')}`);
  expect(missing.status()).toBe(404);
  await expect(missing.json()).resolves.toMatchObject({ error: { code: 'DETAIL_NOT_FOUND' } });

  const armor = await api.get('/api/v1/catalog', { params: { kind: 'armor' } });
  await expect(armor.json()).resolves.toHaveLength(139);
  const weapons = await api.get('/api/v1/catalog', { params: { kind: 'weapon' } });
  await expect(weapons.json()).resolves.toHaveLength(356);

  const bad = await api.get('/api/v1/catalog', { params: { kind: 'banana' } });
  expect(bad.status()).toBe(400);
});
