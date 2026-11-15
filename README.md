# STALZONE Dossier

Личное досье по STALZONE: снаряжение, контейнеры, сборки, рекомендации и цены аукциона.
SQLite — источник правды, Nuxt 4 отдаёт сайт и HTTP API, MCP даёт агенту доступ к тем же данным.

- **Сайт** — разделы досье с поиском, сортировкой и редактированием.
- **API** — `/api/v1/*` под сессионной авторизацией; запись только через API/MCP/CLI.
- **MCP** — stdio для локального агента и HTTP `/mcp` с Bearer-токеном.
- **Синхронизация** — EXBO-база, stalzone.wiki, облики, профиль, цены scpmodel.

Данные персональные: наружу отдавайте только за HTTPS и с паролем.

## Быстрый старт

Нужен Node.js 24 (минимум 22) и npm.

```bash
npm ci
npm run db:migrate        # схема SQLite
npm run import:legacy     # сиды: досье, иконки, срез вики, цены
npm run dev               # http://127.0.0.1:3000
```

Пароль для входа задаётся одним из двух способов:

```bash
# рекомендуемый: scrypt-хеш в NUXT_PASSWORD_HASH
npm run hash-password -- 'мой-пароль'

# разработка: обычный пароль в NUXT_PASSWORD
NUXT_PASSWORD=dev npm run dev
```

Секрет сессии — `NUXT_SESSION_SECRET`, не короче 32 символов. Без него сервер
работает с эфемерным секретом и предупреждает в лог: после перезапуска все
сессии сбрасываются.

### Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `DB_PATH` | `./data/dossier.db` | файл SQLite (в Docker — `/data/dossier.db`) |
| `ICONS_DIR` | `./public/icons` | каталог `.webp`-иконок (в Docker — `/data/icons`) |
| `NUXT_PASSWORD_HASH` | — | scrypt-хеш пароля сайта |
| `NUXT_PASSWORD` | — | простой пароль для разработки |
| `NUXT_SESSION_SECRET` | эфемерный | HMAC-секрет cookie `dossier_session` |
| `NUXT_MCP_TOKEN` | — | Bearer-токен `/mcp`; пусто — эндпоинт выключен |
| `NUXT_LOGIN_RATE_MAX` | `5` | попыток входа в окне |
| `NUXT_LOGIN_WINDOW_MS` | `60000` | окно rate limit |
| `NUXT_TRUST_PROXY` | — | `1` — доверять `X-Forwarded-For` (только за Caddy/прокси) |
| `REALM` | `ru` | регион источников |
| `PROFILE_FILE` | `./db/seeds/profile.json` | снимок публичного профиля |
| `SNAPSHOTS_DIR` | `./snapshots` | каталог резервных копий |

Полный шаблон — `.env.example`.

## Продакшен-сборка

```bash
npm run build             # .output/
npm run build:cli         # dist/cli.js и dist/mcp-stdio.js
DB_PATH=/data/dossier.db NUXT_SESSION_SECRET=... node .output/server/index.mjs
```

Схема применяется при старте сервера, отдельный шаг миграции не обязателен.

## Docker

```bash
cp .env.example .env      # заполните пароль и секрет
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
curl http://127.0.0.1:3000/api/v1/healthz
```

Контейнер мигрирует базу при старте и хранит её в томе `dossier-data`
(`DB_PATH=/data/dossier.db`). Healthcheck бьёт в `/api/v1/healthz`.

TLS через Caddy (опциональный профиль):

```bash
DOSSIER_DOMAIN=dossier.example.com \
  docker compose -f deploy/docker-compose.yml --profile proxy up -d
```

Первый запуск на пустом томе не содержит досье. Загрузите сиды:

```bash
docker compose -f deploy/docker-compose.yml exec app \
  node dist/cli.js import
```

### Резервные копии

```bash
npm run backup                    # snapshots/dossier-<время>.db, хранение 14 дней
deploy/backup.sh                  # то же внутри контейнера, /data/backups
```

Восстановление: остановить приложение, положить копию на место `DB_PATH`
(и удалить `-wal`/`-shm`), запустить. Подробности — `docs/RUNBOOK.md`.

## Синхронизация источников

```bash
npm run sync                # все источники
npm run sync wiki           # один: exbo_base | wiki | motifs | profile | scpmodel
npm run sync scpmodel -- --force
```

То же доступно кнопками в `/settings` и MCP-инструментом `sync_source`.
Ошибка источника переводит его в `stale`: предыдущий снимок остаётся, UI
показывает его возраст и текст ошибки. Цены обновляются не чаще раза в 15 минут.

## MCP

stdio, локальная база:

```bash
DB_PATH=./data/dossier.db npm run mcp
```

stdio через HTTP (те же инструменты, другая машина):

```bash
DOSSIER_API_URL=https://dossier.example.com \
MCP_TOKEN=... npm run mcp
```

Claude Code / Aside подключают сервер командой:

```json
{
  "mcpServers": {
    "stalzone-dossier": {
      "command": "node",
      "args": ["/app/dist/mcp-stdio.js"],
      "env": {
        "DOSSIER_API_URL": "https://dossier.example.com",
        "MCP_TOKEN": "тот-же-токен-что-NUXT_MCP_TOKEN"
      }
    }
  }
}
```

HTTP-эндпоинт `POST /mcp` (stateless Streamable HTTP) требует
`Authorization: Bearer <NUXT_MCP_TOKEN>`. Если токен не задан — 404.
Запись по умолчанию идёт в режиме `dry_run`; реальная запись требует
`confirm: true` и ограничена 30 изменениями в минуту. Полный список
инструментов — `docs/MCP.md`.

## Проверка

```bash
npm run check      # typecheck + lint + unit/integration
npm run golden     # паритет с легаси-досье: 0 расхождений
npm run build
npm run e2e        # Playwright: сборка, сервер, все сценарии
npm run smoke:mcp  # все read-инструменты MCP против текущей базы
```

## Структура

```
app/                 Nuxt UI: страницы, формы, компоненты
server/              Nitro: API, middleware авторизации, /mcp
packages/core/       схема, репозитории, расчёты, импорт, запись, синк
packages/shared/     zod-схемы, форматирование, ранги
packages/sources/    адаптеры EXBO, wiki, motifs, profile, scpmodel
packages/mcp/        реестр инструментов, stdio и HTTP транспорты
db/migrations/       SQL-миграции
db/seeds/            досье, иконки, срез вики, цены (без сырой базы EXBO)
deploy/              Dockerfile, compose, Caddy, backup
scripts/             CLI, импорт, golden, smoke
docs/                архитектура, API, MCP, модель данных, миграция, runbook
```

## Ограничения

- Никаких игровых учётных данных: проект не логинится в Steam/EXBO и не читает
  файлы игры. Только публичные HTTP-источники.
- Аукцион только читается: цены и лоты, без покупок и выставления.
- Нельзя придумывать числа: нет лота — «нет лота», нет статы — «нет данных».
- `dossier.db` и экспорт не редактируются руками — только API, MCP или CLI.
- Все секреты живут в переменных окружения, не в репозитории.
