# HTTP API

База: `/api/v1`, кроме `/api/auth/*` и `/mcp`. Все ответы — JSON, кроме экспорта
(скачиваемый файл).

## Авторизация

Анонимный запрос к защищённому роуту получает:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Требуется вход" } }
```

- `POST /api/auth/login` `{ "password": "..." }` — ставит HttpOnly cookie
  `dossier_session`; неверный пароль — 401 `INVALID_PASSWORD`.
- `POST /api/auth/logout` — очищает cookie.
- `GET /api/auth/me` — `{ authenticated, expiresAt? }`.

Мутации (`POST/PATCH/PUT/DELETE`) требуют `Origin` этого же хоста либо
`Authorization: Bearer <NUXT_MCP_TOKEN>`. Без Origin — 403 `ORIGIN_REQUIRED`.

## Ошибки

```json
{ "error": { "code": "VALIDATION", "message": "Некорректные данные", "details": [] } }
```

| HTTP | Код | Когда |
|---|---|---|
| 400 | `VALIDATION` | тело/параметры не прошли zod |
| 401 | `UNAUTHORIZED` / `INVALID_PASSWORD` | нет сессии / неверный пароль |
| 403 | `ORIGIN_REQUIRED`, `ORIGIN_MISMATCH` | мутация с чужого источника |
| 404 | `NOT_FOUND` | нет сущности |
| 409 | `NO_CHARACTER` и доменные конфликты | нет персонажа |
| 422 | `ITEM_NOT_FOUND` и доменные ошибки записи | предмет не найден (с `details.suggestions`) |
| 429 | `RATE_LIMITED` | слишком частый вход |

## Чтение

| Метод | Путь | Ответ |
|---|---|---|
| GET | `/api/v1/healthz` | `{ ok: true, db: "ok" }`, публичный |
| GET | `/api/v1/payload` | всё досье: персонаж, снаряжение, каталог, карточки, сборки, свежесть |
| GET | `/api/v1/meta` | `{ meta, catalogMeta, freshness }` |
| GET | `/api/v1/character` | персонаж и карьера |
| GET | `/api/v1/items?q=&kind=&rank=&slot=&limit=` | поиск предметов |
| GET | `/api/v1/items/:id` | предмет, статы, карточка |
| GET | `/api/v1/details/:key` | легаси-карточка по ключу `w:`, `a:`, `art:`, `c:` |
| GET | `/api/v1/catalog` | каталог оружия и брони в порядке легаси |
| GET | `/api/v1/owned?kind=` | снаряжение персонажа |
| GET | `/api/v1/containers` | контейнеры с наполнением |
| GET | `/api/v1/builds` | сборки, meta, avoid, current |
| GET | `/api/v1/builds/:slug` | одна сборка |
| GET | `/api/v1/prices?names=A,B` | `price_latest` по названиям |
| GET | `/api/v1/sources` | статусы и возраст источников |
| GET | `/api/v1/events?limit=` | журнал изменений |
| GET | `/api/v1/admin/export` | JSON в формате старого досье (attachment) |

## Запись

Каждая запись возвращает:

```json
{
  "dryRun": false,
  "diff": { "before": {}, "after": {}, "human": "..." },
  "eventId": 42
}
```

`dryRun: true` (или `dry_run` в MCP) возвращает diff и ничего не меняет.

| Метод | Путь | Тело |
|---|---|---|
| POST | `/api/v1/owned` | `OwnedCreateSchema` |
| PATCH | `/api/v1/owned/:id` | `OwnedPatchSchema` |
| DELETE | `/api/v1/owned/:id?qty=` | — (удаляет одну копию или `qty`) |
| PUT | `/api/v1/containers/:id/fill` | `{ artifacts: [{ name, level, quality? }], asOf?, dryRun? }` |
| POST | `/api/v1/builds` | `BuildInputSchema` |
| DELETE | `/api/v1/builds/:slug?dryRun=` | — |
| PUT | `/api/v1/content/:kind` | `ContentBlockInputSchema` (`kind`: `recs`, `earnings`, `notes`, `builds_meta`, `catalog_meta`) |
| PATCH | `/api/v1/character` | `CharacterPatchSchema` |
| POST | `/api/v1/events/:id/rollback` | `{ dryRun? }` |

## Синхронизация

`POST /api/v1/admin/sync` (сессия + Origin):

```json
{ "source": "all", "force": false }
```

`source`: `exbo_base | wiki | motifs | profile | scpmodel | all`. Ответ:

```json
{
  "results": [
    { "source": "wiki", "status": "ok", "items": 947, "fetchedAt": "2026-11-15T04:00:00.000Z" }
  ]
}
```

Ошибка источника не роняет запрос: `status: "stale"`, `error` с текстом,
предыдущие данные остаются. `scpmodel` внутри 15-минутного TTL не ходит в сеть
(`items: 0`, `ageMin`).

## MCP

`POST /mcp` — stateless Streamable HTTP, `Authorization: Bearer <NUXT_MCP_TOKEN>`.
Без настроенного токена — 404; без/с неверным токеном — 401. Протокол и список
инструментов — `docs/MCP.md`.
