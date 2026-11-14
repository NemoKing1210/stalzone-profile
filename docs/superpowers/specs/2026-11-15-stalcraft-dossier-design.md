# Дизайн: stalcraft-dossier (Nuxt)

Дата: 2026-11-15. Исходное задание: `docs/PLAN.md`. Предыдущая версия дизайна (Fastify + статика) заменена: пользователь выбрал полноценный сайт на Nuxt с API внутри Nitro и одним деплоем.

## Цель

Отдельный воспроизводимый репозиторий досье STALZONE: SQLite — источник правды, Nuxt SSR — сайт и HTTP API, MCP — доступ для агента, Docker — один сервис для развёртывания.

## Стек

- TypeScript, Node 24, ESM; Nuxt 4 (Vue 3, Nitro, Vue Router).
- UI: **Nuxt UI 4** (Tailwind CSS 4, `@nuxt/ui`) — таблицы, модалки, формы, тосты, тёмная тема, палитра; свои компоненты только для предметных карточек.
- БД: SQLite (WAL), `better-sqlite3`; миграции `NNNN_*.sql`.
- Валидация: `zod` 4, общие схемы для API и MCP.
- MCP: `@modelcontextprotocol/sdk` 1.32; stdio-шим и HTTP-маршрут `/mcp`.
- Тесты: `vitest` (unit/integration пакетов), Playwright (e2e сайта и API).
- Сборка: `nuxt build` + `tsup` для CLI и stdio-шима.
- Деплой: Docker Compose (`app` + опциональный `caddy`), том с БД и снапшотами.

## Архитектура

Один деплой — один процесс Nitro (`node .output/server/index.mjs`). Каталог `apps/` исчезает.

```
nuxt.config.ts
app/                      страницы, layout, компоненты, composables
server/
  api/auth/*               login/logout/me
  api/v1/*                 read/write API
  routes/mcp.ts            Streamable HTTP MCP (Bearer)
  middleware/auth.ts       защита страниц и API
  plugins/db.ts            singleton БД + миграции на старте
  utils/{db,auth,errors}.ts
packages/shared/           norm, ranks, форматирование, zod-схемы
packages/core/             БД, repo, calc, import/export, payload, writes
packages/sources/          EXBO, wiki, motifs, profile, scpmodel
packages/mcp/              реестр инструментов, LocalClient/HttpClient, stdio
db/migrations, db/seeds
scripts/cli.ts             migrate, import, export, golden, sync, backup, hash-password
tests/{unit,integration,e2e,fixtures}
deploy/                    Dockerfile, docker-compose.yml, Caddyfile, backup
docs/
```

`packages/core` не знает о Nuxt: его используют Nitro-роуты, CLI и MCP. SQL — только в `packages/core/src/{db,repo}`.

## Решения

1. **Офлайн-режим убран.** Сайт живёт на сервере; `payload.js`, `file://` и статическая сборка удаляются. `buildPayload` остаётся сервисом для API, SSR и тестов.
2. **API — Nitro.** Маршруты `server/api/v1/*` вызывают сервисы core. Формат ошибок: `{ error: { code, message, details } }`. Ответы с персональными данными — `Cache-Control: private, no-store`.
3. **Авторизация.** Страница `/login`, пароль из env (`DOSSIER_PASSWORD_HASH` scrypt, либо `DOSSIER_PASSWORD` для dev), сессия — подписанная HttpOnly-cookie (`NUXT_SESSION_SECRET`), SameSite=Lax, Secure в production. Глобальный middleware защищает страницы и API; публичны только `/login`, `/api/auth/login`, `/api/v1/healthz`. Мутации дополнительно проверяют `Origin`. Лимит входа — 5 попыток/мин на IP.
4. **MCP.** Общий реестр инструментов в `packages/mcp`; stdio-шим по умолчанию работает с локальной БД, при `DOSSIER_API_URL` — через HTTP API. `/mcp` в Nitro использует тот же реестр с `LocalClient`, требует `Authorization: Bearer $MCP_TOKEN`; без токена маршрут отключён.
5. **Разделы сайта = маршруты.** `/` (обзор), `/weapons`, `/armor`, `/containers`, `/artifacts`, `/builds`, `/recommendations`, `/earnings`, `/notes`. Старые ссылки `?tab=weapons` редиректятся на новый путь; `localStorage` хранит сортировки и фильтры.
6. **UI — Nuxt UI, а не самопис.** Навигация и вкладки — `UTabs`/`UNavigationMenu`, таблицы — `UTable`, модалки — `UModal`/`USlideover`, формы — `UForm` + `UInput`/`USelect`/`UInputNumber`/`USwitch`, статусы — `UBadge`/`UAlert`, уведомления — `useToast`, фильтры — `UInput` + `USelectMenu`, подтверждения — `UModal`. Тёмная тема — `useColorMode().preference = 'dark'`, палитра — `app.config.ts`. Собственные компоненты: `ItemCard`, `StatBar`, `RankBadge`, `FreshnessBadge`, `PriceCell` — только предметная логика.
7. **Редактирование в сайте.** Формы для персонажа, owned-предметов (уровень, облик, заметка, качество), наполнения контейнеров, сборок и контент-блоков (рекомендации, заработок, правила). Цены, каталог и результаты синка — только чтение. Каждая запись идёт через сервис, пишет `event_log` в той же транзакции и поддерживает `dry_run`.
8. **Каталог и карточки — отдельные таблицы.** `catalog_entry(kind, position, name, data)` сохраняет 356 оружий и 139 брони, включая два легаси-дубля; `details_card(key, item_id, kind, name, data)` сохраняет ровно 601 карточку с исходными ключами `w:`, `a:`, `art:`, `c:`. Это точнее, чем вывод из `item.raw`.
9. **Owned поддерживает копии.** `owned.qty` для полностью идентичных копий; уникальность — `(character_id, item_id, level, COALESCE(quality,''), COALESCE(skin_item_id,0))`. Payload разворачивает `qty` в отдельные элементы, поэтому досье по-прежнему отдаёт 35 оружий и 22 артефакта (включая Winchester M70 ×2 и Нервяк ×3).
10. **Показ чисел.** Единая формула: `dmg = round(raw, 1)`, `dps = round(dmg × rof / 60)`, `ttk = round((ceil(600/dmg) − 1) × 60 / rof, 2)`. Это воспроизводит легаси-округление; golden-фикстура хранит входы и ожидаемые значения, список легаси-расхождений пуст и проверяется точно.
11. **+15 из `damageVariants`.** Точные массивы по 16 уровням из `wiki/ttk_weapon.json`; если значений нет (Chiappa, «Огниво»), поля остаются `null`, ничего не придумывается.
12. **Легаси-фолбэки.** Для owned-предметов источник — `owned.extra.legacy` (а не только `raw.ownedLegacy`), поэтому «Огниво» получает dmg/rof, а не пустоту.
13. **Сид репозитория:** `legacy.json`, `icons.json`, срез wiki, `auction-ru.json`, `profile.json`, `labels.json`, `extra-items.json`. Сырая база EXBO (25 МБ) не коммитится.
14. **Синк:** адаптеры `exbo`, `wiki`, `motifs`, `profile`, `scpmodel`; кэш снапшотов, статус `source`, при ошибке — `stale` + последний удачный снапшот. Ручной запуск из `/settings` и CLI.
15. **Деплой:** multi-stage Dockerfile, один сервис `app`; Caddy опционален. Миграции на старте, бэкапы через `db.backup()` с ротацией 14 дней.
16. **Иконки:** `icons.json` → таблица `icon`; файлы `.webp` отдаются Nitro из `public/icons/<sha1>.webp`, data-URL в БД не хранятся.

## Отклонённые варианты

- **Fastify + статическая страница** — два артефакта, нет SSR и нормальной авторизации; требование «двойной клик» снято пользователем.
- **SPA + отдельный API** — снова два приложения и два деплоя; не даёт преимуществ для одного пользователя.
- **Nuxt static (`nuxt generate`) + внешний API** — не решает приватность данных и усложняет auth.

## Не-цели

- Многопользовательский режим, OAuth, роли.
- Автоматизация аукциона, вход в игру/Steam, чтение файлов игры.
- Публичный доступ без авторизации.
- Мобильное приложение и PWA.
- Реальный деплой на VPS (проверяется локальный `docker compose`).

## Критерии приёмки

- `npm run golden` — 0 расхождений сверх допуска (DPS 0,5; TTK 0,01), известные аномалии перечислены явно.
- `npm run check` (lint, typecheck, unit/integration) и `npm run e2e` зелёные.
- Сайт: вход, 9 разделов, редактирование, сохранение после перезагрузки, `?tab=` редиректы.
- `docker compose up -d` поднимает сайт, `/api/v1/healthz` отвечает, данные переживают рестарт, бэкап восстанавливается.
- MCP stdio и `/mcp` возвращают одинаковые результаты; `dry_run` не меняет БД.
