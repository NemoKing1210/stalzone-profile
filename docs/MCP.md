# MCP-сервер

Один реестр инструментов обслуживает stdio и HTTP — результаты не расходятся.

## Подключение

### stdio, локальная база

```bash
DB_PATH=./data/dossier.db npm run mcp
# продакшен:
node dist/mcp-stdio.js
```

### stdio через HTTP

```bash
DOSSIER_API_URL=https://dossier.example.com MCP_TOKEN=... npm run mcp
```

Без `DOSSIER_API_URL` шим открывает SQLite напрямую; с ним — ходит в `/mcp`.

### HTTP

`POST /mcp` — stateless Streamable HTTP, заголовок
`Authorization: Bearer <NUXT_MCP_TOKEN>`.
`NUXT_MCP_TOKEN` пуст → 404 (эндпоинт выключен); неверный токен → 401.

Конфиг клиента:

```json
{
  "mcpServers": {
    "stalzone-dossier": {
      "command": "node",
      "args": ["/app/dist/mcp-stdio.js"],
      "env": { "DOSSIER_API_URL": "https://dossier.example.com", "MCP_TOKEN": "..." }
    }
  }
}
```

## Политика записи

- `dry_run` по умолчанию `true`: возвращается `{ dryRun, diff, eventId? }`, база не меняется.
- Реальная запись: `dry_run: false` **и** `confirm: true`, иначе `CONFIRM_REQUIRED`.
- Не больше 30 применённых записей в минуту на процесс; иначе `RATE_LIMITED`.
- `sync_source` также требует `confirm: true`.
- `rebuild_site` не пересобирает сайт: возвращает `NOT_SUPPORTED` с командой деплоя.
- `rollback_event` восстанавливает сущность из снимка `event_log`.

Ошибки инструмента: `{ isError: true, content: [{ text: "{\"error\":{\"code\",\"message\"}}" }] }`.

Ресурс `dossier://schema` отдаёт описания инструментов и правила записи.

## Инструменты чтения

| Инструмент | Аргументы | Что возвращает |
|---|---|---|
| `get_character` | — | персонаж и meta |
| `find_items` | `q?`, `kind?`, `rank?`, `slot?`, `limit?` | список предметов |
| `get_item` | `id` или `name` + `kind?` | предмет, статы, карточка, иконка |
| `compare_items` | `a`, `b`, `level` | DPS/TTK и статы двух предметов |
| `list_owned` | `kind?` | снаряжение с `ownedId`, `qty`, качествами |
| `list_containers` | — | контейнеры и наполнение |
| `list_builds` | — | сборки и meta |
| `get_build` | `slug` | одна сборка |
| `plan_artifact_build` | preset/effects, slots, budget, mode, quality, unique, requireLot | план артефактов по цене |
| `get_prices` | `names[]`, `quality?` | последние цены по каждой комбинации |
| `sources_status` | — | статус, `lastOkAt`, `lastError` источников |
| `export_legacy_json` | — | JSON старого формата |

## Инструменты записи и обслуживания

| Инструмент | Аргументы |
|---|---|
| `upsert_owned_item` | `name`, `kind`, `level`, `skin?`, `quality?`, `note?`, `role?`, `dry_run?` |
| `remove_owned_item` | `name`, `kind`, `level?`, `dry_run?` |
| `set_container_artifacts` | `container`, `artifacts[]`, `as_of?`, `dry_run?` |
| `save_build` | `slug`, `title`, `rows[]`, остальные поля сборки, `dry_run?` |
| `delete_build` | `slug`, `dry_run?` |
| `upsert_content_block` | `kind`, `slug?`, `title?`, `lead?`, `payload`, `position?`, `dry_run?` |
| `sync_source` | `source`: `exbo \| wiki \| motifs \| profile \| scpmodel`, `force?`, `confirm` |
| `rollback_event` | `event_id`, `dry_run?` |
| `rebuild_site` | — |

`upsert_owned_item` добавляет одну копию, `remove_owned_item` удаляет одну:
MCP не управляет количеством, для этого есть сайт/API с `qty`.

## Проверка

```bash
DB_PATH=./data/dossier.db npm run smoke:mcp
```

Скрипт вызывает все read-инструменты и валидирует ответы zod-схемами;
падает с кодом 1 при первом несоответствии.
