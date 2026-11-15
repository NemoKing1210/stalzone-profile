# Runbook

## 1. Первый запуск

```bash
git clone <repo> stalzone-profile && cd stalzone-profile
cp .env.example .env
npm run hash-password -- 'пароль'      # вставьте в NUXT_PASSWORD_HASH
openssl rand -hex 32                   # вставьте в NUXT_SESSION_SECRET
```

`NUXT_MCP_TOKEN` нужен, только если агенту разрешён HTTP-доступ: это отдельный
секрет, не пароль сайта.

Локально:

```bash
npm ci
npm run db:migrate
npm run import:legacy
npm run dev
```

## 2. Docker

```bash
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps
curl -fsS http://127.0.0.1:3000/api/v1/healthz
```

Первый старт создаёт `/data/dossier.db` и применяет миграции. Досье на пустом
томе пустое — загрузите сиды:

```bash
docker compose -f deploy/docker-compose.yml exec app node dist/cli.js import
docker compose -f deploy/docker-compose.yml restart app
```

Проверка: `http://<host>:3000/login` отдаёт форму, вход — пароль из `.env`.

### TLS

```bash
DOSSIER_DOMAIN=dossier.example.com \
  docker compose -f deploy/docker-compose.yml --profile proxy up -d
```

Caddy сам получает сертификат (нужны 80/443 и DNS). Без домена профиль `proxy`
не включайте: наружу должен смотреть только HTTPS.

За прокси включите `NUXT_TRUST_PROXY=1` в `.env`: иначе rate limit входа считает
всех клиентов по IP контейнера Caddy, а подделанный `X-Forwarded-For` его не
обходит. Без прокси переменную оставляйте пустой.

## 3. Резервные копии

Ежедневно (cron вне контейнера):

```bash
cd /opt/stalzone-profile && deploy/backup.sh
```

Либо локально: `npm run backup`. Команда использует `db.backup()` (безопасно
при работающем WAL), кладёт `dossier-<ISO>.db` в `snapshots/` (или `/data/backups`)
и удаляет копии старше 14 дней.

### Восстановление

1. Сделайте копию текущей базы (даже сломанной).
2. Остановите приложение.
3. Замените файл и удалите журналы WAL:

```bash
docker compose -f deploy/docker-compose.yml stop app
docker run --rm -v stalzone-dossier_dossier-data:/data -v "$PWD":/backup alpine \
  sh -c 'cp /backup/dossier-2026-11-15T04-00-00-000Z.db /data/dossier.db && rm -f /data/dossier.db-wal /data/dossier.db-shm'
docker compose -f deploy/docker-compose.yml start app
```

4. Проверьте `/api/v1/healthz` и `/api/v1/sources`.

Проверка копии на отдельном файле: скопируйте её в `/tmp/check.db`, откройте
CLI с `DB_PATH=/tmp/check.db node dist/cli.js export /tmp/check.json` — экспорт
не должен падать.

## 4. Синхронизация

```bash
npm run sync                 # все источники, последовательно
npm run sync scpmodel        # только цены (внутри 15 минут — cached)
npm run sync wiki -- --force # игнорировать TTL/кэш
```

Те же действия — кнопки в `/settings`, инструмент `sync_source` в MCP.

Если источник упал, он остаётся `stale`: старые данные видны, в `/settings`
есть `last_error`, на бейдже свежести — возраст. Не удаляйте базу из-за
`stale`, повторите синк.

## 5. Обновление версии

1. `npm run backup` (или `deploy/backup.sh`).
2. `git pull`.
3. `docker compose -f deploy/docker-compose.yml build`.
4. `docker compose -f deploy/docker-compose.yml up -d`. Entrypoint применит
   новые миграции.
5. Проверьте healthz, `/settings` (источники), открытие карточки и одной
   записи с dry run.

Откат: вернуть предыдущий образ/тег и `up -d`; база совместима обратно только
если миграции не разрушающие. Перед обновлением всегда есть бэкап.

## 6. Диагностика

| Симптом | Что проверить |
|---|---|
| 502 от Caddy | `docker compose ps`, логи `app`, healthcheck |
| Все запросы 401 | `NUXT_SESSION_SECRET` не менялся? после смены секрета вход заново |
| Вход 429 | rate limit (`NUXT_LOGIN_RATE_MAX`), подождите окно 60 с |
| `/mcp` 404 | `NUXT_MCP_TOKEN` пуст — токен не задан |
| `/mcp` 401 | заголовок `Authorization: Bearer ...`, тот же токен |
| Цены не обновляются | `sources_status`, `last_error`, 15-минутный TTL |
| «нет данных» у статы | источник ещё не синхронизирован; не подставляйте числа вручную |
| `SQLITE_BUSY` | не открывайте базу сторонним редактором; WAL уже включён |
| Сайт пустой после деплоя | том новый: выполните `node dist/cli.js import` |

Логи:

```bash
docker compose -f deploy/docker-compose.yml logs -f app
docker compose -f deploy/docker-compose.yml logs -f caddy
```

## 7. Безопасность

- Сайт персональный: держите его за HTTPS и паролем, `robots: noindex`.
- Секреты — только в `.env`/CI-переменных, не в git и не в образах.
- MCP-токен даёт доступ ко всем инструментам, включая запись: отдельный
  секрет, ротация при утечке.
- Аукцион только читается; никаких игровых учётных данных в проекте нет.
- Публичный доступ к `/api/v1/healthz` безвреден (только `ok`/`db`).
