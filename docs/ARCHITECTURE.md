# Архитектура

## Компоненты

```
                    ┌──────────────────────────────┐
  Браузер ────────▶ │ Nuxt 4 (SSR) + Nuxt UI       │
                    │ app/  → страницы и формы     │
                    │ server/api → REST /api/v1    │
                    └──────────────┬───────────────┘
                                   │ better-sqlite3
                    ┌──────────────▼───────────────┐
  MCP-агент ──────▶ │ packages/core                │
  (stdio / HTTP)    │ repo · calc · services       │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │ SQLite (WAL) dossier.db      │
                    └──────────────▲───────────────┘
                                   │ runSync
                    ┌──────────────┴───────────────┐
                    │ packages/sources адаптеры    │
                    │ EXBO · wiki · motifs ·       │
                    │ profile · scpmodel           │
                    └──────────────────────────────┘
```

Один процесс: Nuxt/Nitro обслуживает и сайт, и API, и `/mcp`. Отдельного
воркера и второй базы нет.

## Пакеты

| Пакет | Ответственность |
|---|---|
| `packages/shared` | zod-схемы API/MCP, `norm`, форматирование, ранги |
| `packages/core` | открытие/миграции SQLite, репозитории, формулы, импорт, запись, синк, экспорт |
| `packages/sources` | чистые адаптеры источников: fetch + разбор, без записи в БД |
| `packages/mcp` | реестр 21 инструмента, локальный клиент, stdio и HTTP транспорты |
| `app` | Nuxt UI: разделы, таблицы, модальные формы, журнал событий |
| `server` | Nitro-роуты, сессия, origin-check, `/mcp`, `/api/v1/admin/*` |

Зависимости направлены в одну сторону: `app/server → mcp → core → sources/shared`.
Адаптеры не знают о БД; `core/services/sync.ts` соединяет их с репозиториями.

## Поток чтения

1. Страница вызывает `useDossier()` → `GET /api/v1/payload` или `/api/v1/meta`.
2. Роут берёт общий `Db` из `server/utils/db.ts` (WAL, одна миграция на процесс).
3. `buildPayload` собирает снаряжение, каталог, карточки, сборки и блоки.
4. Числа DPS/TTK считаются одной формулой (`packages/core/src/calc/weapons.ts`)
   из сырого урона и скорострельности; сохранённые легаси-значения не
   подставляются.

## Поток записи

```
форма → useWrite → POST/PATCH/PUT/DELETE /api/v1/... 
      → requireOrigin → zod → core write → event_log(before/after) → ответ
```

- `WriteResult { dryRun, diff:{before,after,human}, eventId? }`.
- `dryRun: true` возвращает diff, ничего не меняя; реальная запись закрывает
  форму и обновляет payload.
- Rollback восстанавливает сущность из снимка в `event_log` и пишет новое
  событие `rollback`; откат самого отката не предлагается.
- Ошибки — единый конверт `{ error: { code, message, details? } }`.

## Авторизация

- Пароль: scrypt-хеш (`NUXT_PASSWORD_HASH`) или plain (`NUXT_PASSWORD`) для dev.
- Cookie `dossier_session`: HMAC-SHA256, HttpOnly, SameSite=Lax, Secure при HTTPS.
- Middleware закрывает всё, кроме `/login`, `/api/auth/login`, `/api/v1/healthz`, `/mcp`.
- `/mcp` сам проверяет `Authorization: Bearer NUXT_MCP_TOKEN`; без токена — 404.
- Мутации требуют совпадения `Origin` (или Bearer для не-браузерных клиентов).
- Логин ограничен по частоте (`NUXT_LOGIN_RATE_MAX`, окно 60 с).

## MCP

Один реестр инструментов (`packages/mcp/src/registry.ts`) обслуживает оба
транспорта:

- **stdio** — `packages/mcp/src/stdio.ts`: при `DOSSIER_API_URL` работает
  HTTP-клиентом, иначе открывает `DB_PATH` и работает локально.
- **HTTP** — `POST /mcp`: stateless `StreamableHTTPServerTransport`, новый
  сервер на запрос, общий rate limiter на процесс.

Запись: `dry_run` по умолчанию, `confirm: true` обязателен, не больше 30
изменений в минуту. Ресурс `dossier://schema` отдаёт описание инструментов и
правила записи.

## Источники и свежесть

| id | Источник | Что обновляет |
|---|---|---|
| `exbo_base` | GitHub EXBO-Studio/stalzone-database | предметы и статы |
| `wiki` | stalzone.wiki API | артефакты, броня, оружие, контейнеры, TTK |
| `motifs` | stalzone.wiki `category=other` | `item.base_item_id` обликов |
| `profile` | ручной снимок публичного профиля | `character.stats` |
| `scpmodel` | scpmodel.ru/api/predictions | `price_snapshot` (TTL 15 мин) |

`source.status`: `idle | ok | stale | error`; `last_ok_at`, `last_try_at`,
`last_error`. При ошибке данные не стираются — UI показывает возраст
последнего успешного снимка.

## Развёртывание

Один образ: сборка Nuxt + CLI, runtime с `.output`, `node_modules`,
`dist`, `db/migrations`, `db/seeds`. Том `/data` хранит `dossier.db` и
резервные копии. Caddy — опциональный профиль для TLS. См. `docs/RUNBOOK.md`.
