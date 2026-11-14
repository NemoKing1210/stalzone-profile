# План: вынести STALZONE-досье в отдельный проект (репозиторий + база + MCP)

Документ-задание для агента-исполнителя. Всё, что нужно знать, чтобы не спрашивать контекст: здесь описан текущий код и данные, целевая архитектура, этапы, критерии приёмки и границы.

---

## 1. Цель и результат

Сегодня досье и сборки — статическая страница внутри папки Aside-проекта: данные лежат в одном JSON (`data/my-gear.json`, 795 КБ), страница собирается скриптом и грузит весь payload целиком (1,2 МБ JS). Править данные может только агент через REPL, истории изменений нет, отдать сайт кому-то ещё нельзя.

Нужно:

1. **Отдельный git-репозиторий** `stalcraft-dossier`, разворачиваемый одной командой, с историей изменений.
2. **SQLite как источник правды** для предметов, инвентаря, контейнеров, сборок и ценовых снапшотов (один файл, бэкап = копирование, никакой инфраструктуры).
3. **MCP-сервер**, через который агент читает и пишет данные типизированными инструментами (`upsert_owned_item`, `save_build`, `sync_prices`), а не редактирует JSON текстом.
4. **Сайт остаётся таким же по виду** (тёмная тема, вкладки, модалки, `?tab=`, localStorage) — меняется только способ получения данных: `fetch` из API с офлайн-фолбэком на статический `payload.json`.

Итог этапа: `git clone` → `docker compose up` → сайт с актуальными данными, MCP-инструменты в настройках Aside, экспорт в JSON одной кнопкой.

---

## 2. Что уже есть (as-is, проверено)

Путь: `[redacted legacy source]`.

| Часть | Файл | Объём |
|---|---|---|
| Данные досье | `data/my-gear.json` | 795 КБ: `character`, `career`, 35 оружий, 12 брони, 3 контейнера, 22 артефакта, 5 сборок, 4 секции рекомендаций, 12 строк заработка, 8 правил, `catalog` (356 оружий + 139 брони), `details` (601 карточка), `builds` |
| Иконки | `data/icons.json` | 99 записей, 650 КБ, webp data-URL 96×96, ключи `w:`, `a:`, `c:`, `art:<Имя>[:<уровень>]` |
| Официальная база EXBO | `data/db/ru/*.json` | 9 996 предметов: weapon, armor, artefact, containers, backpacks, bullet, attachment, weapon_modules, medicine, grenade, device, supply, misc, other |
| Кэш stalzone.wiki | `data/wiki/*.json` | artefact (104, с диапазонами и `additionalStats`), weapon, armor, containers (56), attachment, consumable, tags, ttk_weapon/bullet/plate/medicine, builds-public, motifs-map (219 обликов → база) |
| Цены аукциона | `data/cache/auction-ru.json` | 1590 позиций (536 артефактов), TTL 15 мин, источник `scpmodel.ru/api/predictions?region=ru` |
| Профиль | `data/profile/nemo-king-*.json` | снимок публичного профиля (sctools.tech) |
| Логика оружия | `tools/lib-stalzone.js` | `SZ.load/find/compare/statsText/uniqueWeapons/report` — загрузка базы, DPS/TTK, сравнение |
| Логика рынка | `tools/lib-market.js` | `SZM.load/refreshPrices/price/priceRows/artifactBuild/reportArtifacts/containers/artEffects/artStat` — цены, оптимизация сборок под бюджет |
| Страница | `tools/gear-page.template.html` (85 КБ) + `tools/build-gear-page.js` (`GEN_GEAR_PAGE()`) | вкладки Обзор / Оружие / Броня / Контейнеры / Артефакты / Сборки / Рекомендации / Заработок / Правила, модальные карточки, сортировки, фильтры, `?tab=` + localStorage |
| Сборка | `report/stalcraft.html` + `report/data/gear-data.js` | статика, `window.GEAR_DATA` / `window.GEAR_ICONS`, открывается двойным кликом (`report/open-gear.cmd`) |

Свойства сегодняшней модели, которые нельзя потерять при переносе:

- **Числа считаются, а не хранятся**: DPS = урон × выстрелы/мин / 60; TTK по манекену 600 HP: `ceil(600/урон)` выстрелов, `(n−1)×60/ВПМ`; заточка берётся из `damageVariants` (16 уровней); пулестойкость брони — из `numericVariants` вики, а не из `bullet_dmg_factor`.
- **У артефакта два слоя статов**: основные (`stats`) и дополнительное свойство (`additionalStats`, диапазон). Второй слой у каждого экземпляра свой — в UI он показывается отдельной строкой «доп.» и в суммах помечен диапазоном.
- **Облики подменяют название**: у косметики в базе `cat: other`, база определяется по `name.key` (`item.motif.wpn.ks1_ssop` → KS-1), готовая карта — `data/wiki/motifs-map.json`.
- **Цены — кэш, не истина**: только минимальный лот с датой и реалмом; «нет лота» → «ориентир по последней сделке».
- **Арсенальные версии («(А)»)** — отдельные предметы в базе, не варианты одного.

---

## 3. Принципы целевой архитектуры

1. **Один источник правды — SQLite.** Никаких «истина в JSON, база для удобства». JSON остаётся только экспортом и сид-файлом.
2. **MCP — единственный писатель.** Любая запись идёт через сервисный слой; руками в базу не пишем. Каждая запись попадает в `event_log` (кто, когда, что было, что стало) — это же даёт откат.
3. **Нормализуем только то, по чему ищем и считаем** (предметы, статы, инвентарь, цены, сборки). Прозаические вкладки (рекомендации, заработок, правила) живут как JSON-блоки в `content_block`: их не нужно раскладывать по таблицам.
4. **Гибкие статы — ключ-значение, а не колонки.** EXBO добавляет новые статы каждый патч; `item_stat(item_id, key, level)` переживает это без миграций. Исходный объект предмета хранится целиком в `raw JSON` — страховка от потери полей.
5. **Источники за интерфейсами (ports & adapters).** `ExboBaseAdapter`, `WikiAdapter`, `ScpmodelAdapter`, `ProfileAdapter` реализуют общий `SourceAdapter`. Умер scpmodel или сменил формат — меняется один адаптер, приложение и MCP не трогаются. У каждого источника — `source.last_ok_at`, ETag и «последний удачный снапшот» как фолбэк.
6. **Провенанс каждого числа.** Цена и стата знают `source_id` и `fetched_at`; в UI это бейдж «цены от 15.11 01:45». Нет данных — значит «нет данных», а не догадка.
7. **Сервисный слой один на всех.** HTTP API, MCP и CLI вызывают одни и те же функции `packages/core/services/*`, бизнес-логика не дублируется.
8. **Фронтенд не переписываем.** Тот же ванильный HTML/CSS/JS без сборщика: страница остаётся открываемой файлом, `?tab=` и localStorage сохраняются.
9. **Всё воспроизводимо:** `docker compose up` + миграции + сиды + тесты. Никаких ручных шагов «а потом поправь файл».

---

## 4. Схема компонентов

```
┌──────────────────────────────┐        ┌────────────────────────────────┐
│  Агент (Aside / Claude Code) │        │  Браузер (ПК, телефон)         │
└──────────────┬───────────────┘        └───────────────┬────────────────┘
               │ MCP (stdio или HTTP+token)             │ HTTPS (basic-auth)
┌──────────────▼───────────────┐        ┌───────────────▼────────────────┐
│ apps/mcp  (MCP SDK)          │        │ apps/web (статика: шаблон+JS)  │
│  tools: read/write/sync      │        │  fetch /api/v1/payload         │
└──────────────┬───────────────┘        └───────────────┬────────────────┘
               │                                        │
         ┌─────▼────────────────────────────────────────▼─────┐
         │ apps/api (Fastify): /api/v1/*, ETag, gzip, auth    │
         │   ↓ вызывает только packages/core/services         │
         └─────┬──────────────────────────────────┬───────────┘
               │                                  │
   ┌───────────▼────────────┐        ┌────────────▼─────────────────────┐
   │ packages/core          │        │ packages/sources (адаптеры)      │
   │ domain, repos, calc,   │        │ exbo | wiki | scpmodel | profile │
   │ build optimizer, schema│        │ fetch + retry + ETag + snapshot  │
   └───────────┬────────────┘        └────────────┬─────────────────────┘
               │                                  │
         ┌─────▼──────────┐               внешние HTTP API (кэш на диск)
         │ SQLite (WAL)   │
         │ dossier.db     │
         └────────────────┘
```

Дерево репозитория:

```
stalcraft-dossier/
├─ apps/
│  ├─ api/            # HTTP API: payload, entities, health, meta
│  ├─ mcp/            # MCP-сервер: тонкий слой над services
│  └─ web/            # статика: index.html (шаблон), assets, icons/, manifest.json
├─ packages/
│  ├─ core/           # домен: схемы (zod), репозитории, расчёты, оптимизатор сборок
│  ├─ sources/        # адаптеры источников + нормализация + снапшоты
│  └─ shared/         # утилиты: форматирование чисел/процентов, ранги, цвета, ru-локаль
├─ db/
│  ├─ migrations/     # SQL-миграции (нумерованные, идемпотентные)
│  └─ seeds/          # стартовые данные: dossier.json, icons/, catalog/
├─ scripts/
│  ├─ import-legacy.ts   # существующий my-gear.json → база
│  ├─ export-json.ts     # база → my-gear.json (обратная совместимость)
│  ├─ build-web.ts       # шаблон + манифест → apps/web/dist
│  └─ golden.ts          # сверка чисел с текущей страницей (parity)
├─ tests/
│  ├─ unit/  integration/  e2e/  fixtures/
├─ deploy/
│  ├─ docker-compose.yml  Dockerfile  Caddyfile  backup.sh
├─ docs/
│  ├─ ARCHITECTURE.md  API.md  MCP.md  DATA-MODEL.md  MIGRATION.md  RUNBOOK.md  CHANGELOG.md
└─ .gitlab-ci.yml
```

---

## 5. Стек и решение по языку (ADR-001)

**Рекомендация: TypeScript / Node 22.**

| Критерий | TS/Node | Python |
|---|---|---|
| Переиспользование текущей логики (`SZ`, `SZM`, парсеры базы) | почти копия, переписать в модули | полный порт, риск расхождения чисел |
| Фронтенд | тот же язык, общие типы через `zod` | два языка в проекте |
| MCP SDK | официальный `@modelcontextprotocol/sdk` | FastMCP, тоже хорош |
| SQLite | `better-sqlite3` (sync, быстрый, без ORM) | `sqlite3` / SQLAlchemy |
| Схемы | `zod` (валидация входа API и MCP) | pydantic |

Ограничение: если исполнитель сильнее в Python — берём Python (FastAPI + pydantic + FastMCP + `sqlite3` + pytest). Архитектура не меняется, но шаг «golden parity» (§ 13) становится обязательным, потому что логику придётся портировать.

Состав:

- API: `fastify` + `@fastify/etag` + `@fastify/compress` + `zod`.
- БД: SQLite в WAL-режиме, `better-sqlite3`, миграции — собственный раннер по `db/migrations/NNNN_*.sql` (ORM не нужен: запросы простые и их немного).
- Тесты: `vitest` (unit/integration) + `playwright` (e2e-смоук страницы).
- Качество: `tsc --noEmit`, `eslint`, `prettier`.
- Деплой: Docker Compose (api + caddy), том для `dossier.db` и `snapshots/`.

---

## 6. Модель данных (SQLite)

Стартовая точка; изменения только миграциями. `PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;`

```sql
CREATE TABLE source (            -- источники данных и их здоровье
  id TEXT PRIMARY KEY,           -- exbo_base | wiki | scpmodel | profile
  kind TEXT NOT NULL, url TEXT,
  last_ok_at TEXT, last_try_at TEXT, etag TEXT,
  status TEXT,                   -- ok | stale | error
  last_error TEXT
);

CREATE TABLE character (
  id INTEGER PRIMARY KEY,
  nick TEXT NOT NULL, realm TEXT NOT NULL,
  faction TEXT, clan TEXT, arrived TEXT,
  hours INTEGER, kd REAL, accuracy REAL, headshot REAL,
  money INTEGER, stash TEXT, playstyle TEXT,
  stats JSON,                    -- квесты, тайники, урон и прочая статистика
  updated_at TEXT NOT NULL,
  UNIQUE(nick, realm)
);

CREATE TABLE item (              -- нормализованный каталог (EXBO + вики)
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source(id),
  exbo_id TEXT NOT NULL, realm TEXT NOT NULL,
  name TEXT NOT NULL, name_en TEXT,
  kind TEXT NOT NULL,            -- weapon | armor | container | artifact | attachment | ammo | motif | other
  category TEXT,                 -- weapon/assault_rifle, armor/combined, artefact/gravity ...
  rank TEXT,                     -- default | newbie | stalker | veteran | master | legend
  slot TEXT,                     -- основное | вторичное (для оружия)
  weight REAL, quality TEXT,
  is_cosmetic INTEGER NOT NULL DEFAULT 0,
  base_item_id INTEGER REFERENCES item(id),   -- облик → базовый предмет
  icon_path TEXT,
  raw JSON NOT NULL,             -- исходный объект источника, не выбрасываем
  updated_at TEXT NOT NULL,
  UNIQUE(realm, exbo_id)
);
CREATE INDEX item_name ON item(name);
CREATE INDEX item_kind ON item(kind, category);

CREATE TABLE item_stat (         -- гибкие статы: новые ключи не ломают схему
  item_id INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  key TEXT NOT NULL,             -- damage.start | armour.bullet | artefact.sprint_speed_modifier
  level INTEGER NOT NULL DEFAULT 0,        -- уровень заточки, 0 = база
  value_num REAL, value_min REAL, value_max REAL, value_text TEXT,
  pct INTEGER NOT NULL DEFAULT 0,
  positive INTEGER,
  is_additional INTEGER NOT NULL DEFAULT 0, -- 1 = дополнительное свойство артефакта
  source_id TEXT REFERENCES source(id),
  PRIMARY KEY (item_id, key, level, is_additional)
);

CREATE TABLE owned (             -- что реально есть у игрока
  id INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES item(id),
  kind TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  skin_item_id INTEGER REFERENCES item(id),
  quality TEXT, note TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(character_id, item_id, level, skin_item_id)
);

CREATE TABLE container_fill (    -- состав артефактов в контейнере (снимок)
  container_owned_id INTEGER NOT NULL REFERENCES owned(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  artifact_item_id INTEGER NOT NULL REFERENCES item(id),
  level INTEGER NOT NULL, quality TEXT,
  as_of TEXT NOT NULL,
  PRIMARY KEY (container_owned_id, slot)
);

CREATE TABLE build (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL, short TEXT, tag TEXT, goal TEXT,
  container_item_id INTEGER REFERENCES item(id),
  slots INTEGER, eff REAL, budget INTEGER, total INTEGER,
  metrics JSON, verdict TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE build_slot (
  build_id INTEGER NOT NULL REFERENCES build(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  item_id INTEGER REFERENCES item(id),  -- NULL для текстовых строк
  label TEXT, quality TEXT,
  price INTEGER, lots INTEGER,
  eff TEXT, bonus TEXT, minus TEXT, why TEXT,
  PRIMARY KEY (build_id, position)
);

CREATE TABLE price_snapshot (    -- цены: только снапшоты, истины тут нет
  id INTEGER PRIMARY KEY,
  item_id INTEGER REFERENCES item(id),
  name TEXT NOT NULL,            -- дублируем имя: лот может быть на предмет вне каталога
  quality TEXT,
  lot_price INTEGER, lot_count INTEGER, last_trade INTEGER,
  source_id TEXT NOT NULL REFERENCES source(id),
  fetched_at TEXT NOT NULL
);
CREATE INDEX price_lookup ON price_snapshot(item_id, quality, fetched_at DESC);
CREATE VIEW price_latest AS
  SELECT p.* FROM price_snapshot p
  WHERE p.id IN (
    SELECT id FROM price_snapshot q
    WHERE q.name = p.name AND IFNULL(q.quality, '') = IFNULL(p.quality, '')
    ORDER BY q.fetched_at DESC LIMIT 1
  );

CREATE TABLE content_block (     -- прозаические вкладки: рекомендации, заработок, правила
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,            -- recs | earnings | notes
  slug TEXT, title TEXT, lead TEXT,
  payload JSON NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE event_log (         -- аудит и откат
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL, actor TEXT NOT NULL,   -- agent | user | sync
  action TEXT NOT NULL, entity TEXT, entity_id TEXT,
  before JSON, after JSON, note TEXT
);
```

Почему так:

- `item_stat` с колонкой `level` покрывает обычные статы, массивы по 16 уровням заточки (строка на уровень), диапазоны артефактов (`value_min`/`value_max`) и дополнительное свойство (`is_additional`).
- `raw` в `item` гарантирует, что новый патч базы ничего не потеряет до появления нормализации.
- `price_latest` — вьюха, чтобы UI и сборки всегда читали свежий лот, а история оставалась в таблице.
- `content_block` намеренно JSON: текст рекомендаций не надо раскладывать на колонки, но он остаётся версионируемым.

---

## 7. API-контракт

Базовый префикс `/api/v1`, ответы JSON, gzip, `ETag` + `If-None-Match` (страница не перекачивает мегабайт при F5).

| Метод | Путь | Что отдаёт |
|---|---|---|
| GET | `/api/v1/payload?tab=<id>` | готовый объект для страницы: `{ meta, character, weapons, armor, containers, artifacts, catalog, details, builds, recommendations, earnings, notes }`. `tab` позволяет урезать ответ, но по умолчанию всё (gzip ~150 КБ) |
| GET | `/api/v1/items?kind=weapon&q=ак-12&rank=master&limit=50` | поиск по каталогу |
| GET | `/api/v1/items/:exboId?level=15` | карточка предмета со статами на уровне |
| GET | `/api/v1/owned?kind=artifact` | инвентарь |
| GET | `/api/v1/containers` | контейнеры + состав + `as_of` |
| GET | `/api/v1/builds`, `/api/v1/builds/:slug` | сборки |
| GET | `/api/v1/prices?items=Изюм,Катушка&quality=Необычный` | лот, число лотов, `fetched_at`, источник |
| GET | `/api/v1/sources` | здоровье источников и свежесть |
| GET | `/api/v1/meta` | версия схемы, дата данных, git commit |
| GET | `/api/v1/healthz` | liveness/readiness |
| POST | `/api/v1/admin/sync/:source` | ручной запуск синка (только с токеном) |

Правила:

- `payload` собирает сервис `buildPayload(characterId)` — один и тот же код для API, MCP и CLI-экспорта.
- Всё, что зависит от заточки, отдаётся с явным `level`; DPS/TTK считаются на сервере (`packages/core/calc`), а не в браузере: одна формула на всех.
- Ошибки: `{ error: { code, message, details } }`, коды стабильные (`not_found`, `validation_failed`, `source_unavailable`).
- Схема ответа описана `zod` и генерируется в `docs/API.md` из кода, а не пишется руками.

---

## 8. MCP-сервер

Транспорт: **stdio** для локального запуска (Aside подключает по команде) + опционально HTTP с `Bearer`-токеном. Инструменты — тонкие обёртки над `services/*`, своей логики нет.

**Чтение**

| Инструмент | Аргументы | Возврат |
|---|---|---|
| `get_character` | — | ник, реалм, фракция, деньги, статистика, дата снимка |
| `find_items` | `q, kind?, rank?, slot?, limit?` | список с рангом, весом, ключевыми статами |
| `get_item` | `name \| exboId, level?` | статы, проекция на +15, профиль урона, иконка |
| `compare_items` | `a, b` | урон, DPS, TTK, магазин, перезарядка, дистанция, разброс, отдача, вес |
| `list_owned` | `kind?` | инвентарь с обликами и заточкой |
| `list_containers` | — | слоты, эффективность, защита, состав + `as_of` |
| `list_builds` / `get_build` | `slug?` | сборки с ценами и вердиктом |
| `plan_artifact_build` | `preset, slots, budget, mode, quality?, unique?, effects?` | оптимальный набор, суммарные эффекты, минусы, стоимость (тот же алгоритм, что в `SZM.artifactBuild`, но на SQL) |
| `get_prices` | `names[], quality?` | лот, число лотов, дата, источник |
| `sources_status` | — | свежесть и здоровье источников |

**Запись** (все с `dry_run` и записью в `event_log`)

| Инструмент | Что делает | Защита |
|---|---|---|
| `upsert_owned_item` | добавить/обновить предмет: `name, level, skin?, quality?, note?` | `dry_run` по умолчанию `true`, возвращает diff |
| `remove_owned_item` | убрать из инвентаря | требует `confirm: true` |
| `set_container_artifacts` | заменить состав контейнера списком `[{artifact, level}]` | валидирует число слотов и наличие артефактов |
| `save_build` / `delete_build` | создать/обновить карточку сборки | `slug` обязателен, удаление — с `confirm` |
| `upsert_content_block` | обновить секцию рекомендаций / заработка / правил | схема блока валидируется по `kind` |
| `sync_base` / `sync_wiki` / `sync_prices` / `sync_profile` | обновить источник | `force?`, статус пишется в `source` |
| `rebuild_site` | пересобрать статику из базы | возвращает список изменённых файлов |
| `export_legacy_json` | выгрузить `my-gear.json` текущего формата | совместимость и бэкап |
| `rollback_event` | откатить запись по `event_log.id` | только последние N, с `confirm` |

Требования:

- Каждый write-инструмент возвращает **человекочитаемый diff** («Было: Комета +5; Стало: Вихрь +0»), чтобы агент показал его пользователю перед подтверждением.
- Валидация `zod` с «мягкими» правилами: неизвестное название артефакта → ошибка со списком похожих (fuzzy по `item.name`), а не молчаливое создание мусора.
- Никаких сетевых вызовов внутри write-инструментов: сначала `sync_*`, потом запись. Цены попадают в сборку только снапшотом с `fetched_at`.
- Ресурс `dossier://schema` — JSON-схема payload и таблиц, чтобы агент не гадал о полях.
- README-раздел «Подключение в Aside»: точная команда запуска и поля формы. Ограничение платформы: MCP-серверы подключаются только из панели настроек (кнопка Connect), а сервер, подключённый посреди сессии, виден только из сабагента.

---

## 9. Фронтенд: минимальные изменения

Остаётся: вкладки, `?tab=` + localStorage + hashchange, модалки, сортировки, фильтры, анимации, цвета рангов, рамки иконок, русские подписи, открытие файлом с диска.

Меняется:

1. **Загрузка данных**: вместо `window.GEAR_DATA` из `data/gear-data.js` — `fetch('/api/v1/payload')` с ETag; если `fetch` упал (открыли файлом без сервера) — `fetch('./payload.json')`; если нет и его — плашка «Данные не загрузились» (уже есть).
2. **Иконки**: вместо 650 КБ data-URL внутри JS — файлы `icons/<key>.webp` + `manifest.json`, `Cache-Control: immutable`, ленивая загрузка.
3. **Свежесть**: бейдж в шапке «данные: <дата> · цены: <дата, N мин назад>» из `/api/v1/meta` и `/api/v1/sources`.
4. **Сборка**: `scripts/build-web.ts` копирует `apps/web` и подставляет версию (`?v=<commit>`) в ссылки на JS/CSS. Бандлера нет.

Совместимость: страница должна продолжать работать «двойным кликом по `index.html`» в режиме только чтения (payload.json рядом) — это требование приёмки, а не пожелание.

---

## 10. Адаптеры источников и свежесть

| Адаптер | Источник | Частота | Стратегия |
|---|---|---|---|
| `exboBase` | `github.com/EXBO-Studio/stalzone-database` (`ru/`, `global/`) | при патче + ежедневно | скачать файлы, ETag, upsert `item` + `item_stat(level)`, иконки в `icons/` |
| `wiki` | `stalzone.wiki/api/builds-calculator/items/…`, `api/ttk-calculator/items/…` | раз в сутки | по категориям; диапазоны → `value_min/max`, `additionalStats` → `is_additional=1`, TTK-наборы → `item_stat` с `level` |
| `scpmodel` | `scpmodel.ru/api/predictions?region=ru` | TTL 15 мин при запросе | снапшот в `price_snapshot`; при 5xx — последний удачный + статус `stale` |
| `profile` | `sctools.tech/en/players/<nick>` | вручную / раз в неделю | снимок статистики в `character.stats` |
| `motifs` | `stalzone.wiki/.../?category=other` | раз в сутки | обновление `base_item_id` у обликов |

Общие правила: таймаут 15 с, 2 ретрая с экспоненциальной задержкой, User-Agent с названием проекта, кэш ответов на диск (`data/cache/<source>/<hash>.json`) для офлайна и тестов, лог в `source`. Единая точка входа `runSync(source, {force})` → `{updated, skipped, errors}`.

---

## 11. Миграция текущего состояния

`scripts/import-legacy.ts` читает `data/my-gear.json` + `data/icons.json` + `data/db/ru/*` + `data/wiki/*` + `data/cache/auction-ru.json` и раскладывает в базу.

| Источник | Таблица | Замечания |
|---|---|---|
| `character` | `character` | одна строка; `stats` — как JSON |
| `weapons[]`, `armor[]` | `owned` + `item` по имени | `lvl` → `level`, `skin` → `skin_item_id` (через `motifs-map.json`), ранг брать у самого предмета, а не у облика |
| `catalog.weapons/armor` | `item` + `item_stat(level=15)` | DPS/TTK пересчитать кодом, а не импортировать значения |
| `artifacts[]` | `owned` (kind=artifact) | качество и уровень сохранить, заряд не хранить |
| `containers[]` | `owned` (kind=container) + `container_fill` | `artifactsAsOf` → `as_of` |
| `details` | `item_stat` + `item.raw` | профиль урона по дистанции — в `item_stat` (`damage.start`, `damage.startAt`, `damage.end`, `damage.endAt`, `damage.max`) |
| `builds` | `build` + `build_slot` | `rows[].name` → `item_id` (NULL, если строки нет в каталоге) |
| `recommendations` | `content_block(kind=recs)` | payload = секция целиком |
| `earnings` | `content_block(kind=earnings)` | payload = весь блок |
| `notes` | `content_block(kind=notes)` | по записи на заметку |
| `data/cache/auction-ru.json` | `price_snapshot` | один снапшот с `fetched_at` из меты |
| `data/icons.json` | `apps/web/icons/*.webp` + `item.icon_path` | data-URL → файл |

Критерий миграции: `export_legacy_json` после импорта даёт JSON, семантически равный исходному (сверка по ключам + golden-тест чисел, § 13). Расхождения допустимы только там, где исправлены известные ошибки (например, ранг из облика) — каждое фиксируется в `docs/MIGRATION.md`.

---

## 12. Этапы

Каждый этап заканчивается рабочим состоянием и тестами. Никаких «потом допилю».

**P0. Скелет и паритет (0,5 дня)**

1. `git init`, структура каталогов, `package.json`, `tsconfig`, линтеры, `.gitignore` (без `node_modules`, `*.db`, `snapshots/`).
2. Перенести `tools/lib-stalzone.js` и `tools/lib-market.js` в `packages/sources` / `packages/core` как модули (без глобалов, с типами).
3. `scripts/golden.ts` берёт числа с текущей страницы (`report/stalcraft.html` + `data/my-gear.json`) и сохраняет фикстуру `tests/fixtures/golden.json`.
4. DoD: `npm test` зелёный; `npm run golden` подтверждает, что новые расчёты дают те же числа.

**P1. База и импорт (1 день)**

1. Миграции из § 6, раннер, `PRAGMA`.
2. `scripts/import-legacy.ts` по § 11 с отчётом «импортировано / пропущено / конфликты».
3. Репозитории (`packages/core/repo/*`): чтение и запись только через них, SQL только там.
4. DoD: база собирается с нуля одной командой; `export-json` даёт валидный legacy-JSON; повторный импорт идемпотентен; тесты зелёные.

**P2. API и фронтенд на нём (1 день)**

1. `buildPayload()` + роуты из § 7, ETag, gzip, `/healthz`.
2. Страница: `fetch` → payload → рендер; офлайн-фолбэк на `payload.json`; иконки из файлов; бейдж свежести.
3. DoD: e2e поднимает API и проверяет 9 вкладок, `?tab=builds`, сохранение вкладки после F5, модалку предмета, отсутствие ошибок в консоли; скриншот-базлайн в `tests/e2e/snapshots`.

**P3. MCP: чтение (0,5–1 день)**

1. `apps/mcp` с read-инструментами, ресурс `dossier://schema`, логирование вызовов.
2. README про подключение в Aside; проверка через сабагент, если сервер поднят посреди сессии.
3. DoD: на вопрос «что у меня в ADR-WRBT и сколько стоит Вихрь» агент отвечает через MCP, не читая файлы напрямую.

**P4. MCP: запись и аудит (1 день)**

1. Write-инструменты с `dry_run`, diff-ответом и `event_log`.
2. `rebuild_site`, `export_legacy_json`, `rollback_event`.
3. DoD: добавить сборку инструментом → `rebuild_site` → страница её показывает; откат возвращает предыдущее состояние; обе операции в `event_log`.

**P5. Синк источников (0,5–1 день)**

1. Адаптеры § 10, `runSync`, кэш на диск, статусы в `source`.
2. DoD: `sync_prices` обновляет снапшот; при искусственном 500 отдаёт `stale` и последние цены; `sync_base` на реальном репозитории обновляет каталог без потери `raw`.

**P6. Деплой и эксплуатация (0,5 дня)**

1. `docker-compose.yml` (api + caddy, том с `dossier.db`), `Caddyfile` с basic-auth, `backup.sh` (sqlite `.backup` + ротация 14 дней).
2. DoD: сайт открывается с телефона по HTTPS за паролем; `docker compose down && up` сохраняет данные; восстановление из бэкапа проверено на копии.

**P7. Опционально:** графики истории цен, публичный read-only режим без персональных данных, экспорт сборки картинкой для шеринга.

---

## 13. Тесты и контроль качества

- **Golden parity (обязательно).** Фикстура `tests/fixtures/golden.json`: 10 стволов × (урон, DPS, TTK на текущей и на +15), 12 единиц брони × пулестойкость, 5 сборок × (итог, бег, движение), суммы эффектов контейнеров. Тест падает при расхождении > 0,01 — защита от «переписал формулу, цифры поплыли».
- **Unit**: `calc` (DPS/TTK/проекция на +15), парсеры базы, `plan_artifact_build` (не превышает бюджет, не берёт два одинаковых, корректно считает «эффект на рубль»).
- **Integration**: импорт legacy → payload → сравнение с текущей страницей по ключевым блокам; идемпотентность синков; миграции вверх-вниз.
- **E2E (Playwright)**: 9 вкладок, `?tab=`, персистентность localStorage, модалка, поиск/фильтр/сортировка, офлайн-режим без API.
- **MCP-смоук**: скрипт, вызывающий каждый инструмент и печатающий результат (проверка схем `zod`).
- **Стиль**: `tsc --noEmit`, `eslint`, `prettier`; в CI всё блокирует мерж.

---

## 14. CI/CD (GitLab)

```yaml
stages: [check, test, build, deploy]

check:
  stage: check
  script: [npm ci, npm run lint, npm run typecheck]

test:
  stage: test
  script: [npm ci, npm run test, npm run test:integration]
  artifacts: { when: always, paths: [coverage/] }

e2e:
  stage: test
  script: [npm ci, npm run build, npx playwright test]
  artifacts: { when: on_failure, paths: [tests/e2e/snapshots/] }

build:
  stage: build
  script: [npm ci, npm run build, npm run export:json]
  artifacts: { paths: [apps/web/dist/, export/] }

deploy:
  stage: deploy
  rules: [{ if: $CI_COMMIT_TAG }]
  script: [rsync -a apps/web/dist/ $VPS:/srv/stalcraft/web/]
```

Секреты (пароль Caddy, токены, ключ registry) — в GitLab CI Variables, не в репозитории. Локально — `.env` в `.gitignore` + 1Password.

---

## 15. Деплой и эксплуатация

```yaml
# deploy/docker-compose.yml (эскиз)
services:
  api:
    build: { context: .., dockerfile: deploy/Dockerfile }
    environment: [NODE_ENV=production, DB_PATH=/data/dossier.db, TZ=Europe/Moscow]
    volumes: ["dossier-data:/data", "../snapshots:/app/snapshots"]
    restart: unless-stopped
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes: ["../apps/web/dist:/srv:ro", "./Caddyfile:/etc/caddy/Caddyfile:ro", "caddy-data:/data"]
    restart: unless-stopped
volumes: { dossier-data: {}, caddy-data: {} }
```

Caddyfile: `handle /api/*` → `reverse_proxy api:3000`; `handle` → `file_server`; сверху `basicauth` (или Cloudflare Access).

Эксплуатация:

- `backup.sh` по cron: `sqlite3 dossier.db ".backup /backups/dossier-$(date +%F).db"`, ротация 14 дней, плюс копия `export/my-gear.json`. Бэкап складывать в [redacted]; восстановление проверять раз в месяц на копии.
- `/api/v1/healthz` + `/api/v1/sources` — мониторинг свежести (алерт, если цены старше 2 часов).
- Логи: JSON-строки с `requestId`, без персональных данных; ошибки адаптеров — отдельным уровнем `warn` со статусом источника.

---

## 16. Безопасность и приватность

- Данные персональные (ник, инвентарь, статистика): публичного доступа без авторизации нет, дефолт — basic-auth + HTTPS.
- MCP: локально stdio (без сети), удалённо — HTTP с `Bearer`-токеном из переменной окружения, привязка к localhost/VPN.
- Никаких игровых учётных данных в проекте: не логинимся в Steam/EXBO, не читаем файлы игры. Только публичные HTTP API.
- Пишущие инструменты: `dry_run` по умолчанию, `confirm` для удалений, всё в `event_log`, лимит «не более N записей в минуту» против циклов.
- Аукцион: только чтение. Автоматических покупок и продаж нет и не будет.

---

## 17. Риски

| Риск | Проявление | Мера |
|---|---|---|
| Расхождение чисел после переноса | страница показывает другой DPS | golden-фикстура из § 13, блокирующая CI |
| scpmodel меняет API или падает | сборки без цен | адаптер + `price_latest` из истории + статус `stale` в UI |
| «Гибкость» превращается в оверинжиниринг | месяц на схему, сайт стоит | правило: нормализуем только то, по чему есть запросы; проза — JSON |
| MCP в Aside подключается вручную | агент «не видит» инструменты | README + `sources_status`; JSON-фолбэк остаётся всегда |
| Двойная запись (агент руками + MCP) | конфликт состояний | README: единственный путь записи — MCP/CLI; `event_log` ловит всё |
| Утечка данных | публичный доступ к досье | basic-auth по умолчанию, отдельный флаг `PUBLIC_READONLY` без персональных полей |
| Windows-специфика путей | падает локально | все пути через `path.join`, тест на Windows-раннере или в WSL |

---

## 18. Не-цели

- Переписывать фронтенд на React/Vue/Next. Ванильный HTML остаётся.
- Многопользовательский режим, роли, OAuth. Один пользователь + один агент.
- Автоматизация аукциона (покупка/продажа лотов), скрейпинг игры, доступ к аккаунту.
- Мобильное приложение, PWA, push-уведомления.
- Хранить текущую экипировку, заряд артефактов и расходники — по правилам проекта это не хранится.

---

## 19. Правила для агента-исполнителя

1. **Сначала тесты паритета, потом рефакторинг.** Ни одна цифра на странице не меняется без явного решения пользователя.
2. **Никаких выдуманных чисел.** Нет цены — «нет лота»; нет статы — «нет данных». У каждой цифры не из базы — источник и дата.
3. **Русский UI** («Скорость бега», «Пулестойкость», «Выносливость»), английские идентификаторы в коде.
4. **Единственный писатель — MCP/CLI.** Не править `dossier.db` руками, не редактировать `payload.json` вручную.
5. **Держать правила предметной области**: облик ≠ предмет (база через `name.key` / `motifs-map`), «(А)» — отдельный предмет, ранг берём у оружия или брони, а не у косметики, пулестойкость брони — из `numericVariants` вики.
6. **Не ломать `?tab=` и localStorage**; страница должна открываться двойным кликом в read-only режиме.
7. **Каждый этап = коммит + зелёный CI + запись в `docs/CHANGELOG.md`.**
8. **Секреты только в env и CI-переменных.**

### Стартовый промпт (можно копировать агенту целиком)

```text
Ты реализуешь проект `stalcraft-dossier` по документу docs/PLAN.md (приложен).
Исходное состояние для миграции: [redacted legacy source] — там
data/my-gear.json, data/icons.json, data/db/ru/*, data/wiki/*, data/cache/auction-ru.json,
tools/lib-stalzone.js, tools/lib-market.js, tools/gear-page.template.html.

Работай по этапам P0…P6, не перескакивая: после каждого этапа — рабочее состояние,
зелёные тесты и запись в docs/CHANGELOG.md. Никаких изменений чисел на странице:
golden-фикстура из P0 — закон. Стек: TypeScript/Node 22, SQLite, zod, Fastify, MCP SDK,
vitest, Playwright.

Начни с P0: создай структуру репозитория, портируй lib-stalzone.js и lib-market.js в
модули с типами, добавь scripts/golden.ts и фикстуру с текущими числами. Покажи результат
прогона golden и список появившихся файлов. Дальше — P1 по плану.
```

---

## 20. Чек-лист приёмки целиком

- [ ] `git clone` + `npm ci` + `npm run db:migrate` + `npm run import:legacy` + `npm run build` работают на чистой машине.
- [ ] `docker compose up` поднимает сайт и API; `/api/v1/healthz` → `ok`.
- [ ] Страница: 9 вкладок, `?tab=builds` открывает сборки, F5 сохраняет вкладку, модалки работают, вид не отличается от текущего (кроме бейджа свежести).
- [ ] `payload.json` рядом с `index.html` даёт рабочую страницу без API.
- [ ] `npm run golden` — расхождений нет.
- [ ] MCP: 10 read + 8 write инструментов отвечают по схеме; запись даёт diff и строку в `event_log`; откат работает.
- [ ] `sync_prices` и `sync_base` обновляют базу; при падении источника UI помечает цены как `stale`.
- [ ] `export:json` возвращает совместимый `my-gear.json`, старая страница из папки Aside продолжает на нём работать.
- [ ] Бэкап и восстановление проверены; в репозитории нет секретов; README описывает запуск, MCP и деплой.

---

## Приложение A. Глоссарий источников

| Название | Что это | Ограничения |
|---|---|---|
| EXBO base | официальный репозиторий предметов игры (`ru`, `global`) | поле `bullet_dmg_factor` — это **не** пулестойкость |
| stalzone.wiki | API калькуляторов: артефакты с диапазонами, контейнеры, TTK-наборы | часть калькуляторов работает только в браузере, API нет |
| scpmodel.ru | аналитика аукциона: минимальный лот, число лотов, история сделок | прогнозы и часть истории — за авторизацией/Premium |
| sctools.tech | публичный профиль игрока (статистика, клан, достижения) | инвентаря и экипировки не отдаёт |

## Приложение B. Почему не «просто Postgres»

Данные — один пользователь, один персонаж, ~10 тыс. предметов и несколько сотен снапшотов цен. SQLite даёт нулевую эксплуатацию, бэкап копированием файла, WAL для параллельного чтения и полную достаточность по нагрузке. Postgres оправдан при нескольких пользователях, конкурентной записи из нескольких сервисов или публичном API — это следующий шаг, а не стартовый. Если понадобится: репозитории уже изолируют SQL, миграция = переписать `db/` и DSN.
