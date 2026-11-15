# Модель данных

SQLite в режиме WAL — единственный источник правды. Изменения только новыми
миграциями в `db/migrations/`.

## Таблицы

| Таблица | Назначение |
|---|---|
| `source` | статус и свежесть источника (`exbo_base`, `wiki`, `motifs`, `profile`, `scpmodel`, `local`) |
| `character` | персонаж и снимок статистики (`stats JSON`) |
| `item` | нормализованный каталог; `raw JSON` хранит исходный объект целиком |
| `item_stat` | статы ключ-значение с уровнем заточки 0…15, диапазонами и `is_additional` |
| `owned` | снаряжение персонажа: `qty` копий, качество, облик, заметка, `extra` для отображения |
| `container_fill` | артефакты в слотах контейнера на дату `as_of` |
| `build` / `build_slot` | сборки и их строки |
| `price_snapshot` | история цен; view `price_latest` — последняя на имя+качество+бонус |
| `content_block` | заметки, рекомендации, заработок, meta сборок и каталога |
| `icon` | ключ → файл иконки (`icons/<sha1>.webp`) |
| `app_meta` | служебные JSON-блоки (meta, career, profile, порядок каталога) |
| `event_log` | журнал записей: `before`/`after` снимки для отката |
| `catalog_entry` | каталог оружия/брони в точном легаси-порядке, с дублями позиций |
| `details_card` | 601 легаси-карточка по ключу `w:`, `a:`, `art:`, `c:` |

Миграции: `0001_init.sql` (базовая схема), `0002_owned_qty_catalog_details.sql`
(копии `owned.qty`, `display_name`, `catalog_entry`, `details_card`).

## Ключевые инварианты

- `item` уникален по `(realm, exbo_id)`; `name_norm` — lower/ё→е/без кавычек.
- `owned` уникален по `(character_id, item_id, level, quality, skin_item_id)`;
  одинаковые копии схлопываются в одну строку с `qty`.
- `item_stat` — `(item_id, key, level, is_additional)`; новые статы EXBO не
  требуют миграции.
- `catalog_entry` уникален по `(kind, position)`, поэтому две пары легаси-дублей
  брони сохраняются как отдельные позиции.
- `price_latest` не хранится, а вычисляется: `ROW_NUMBER()` по
  `(name_norm, quality_norm, bonus)`, свежее — по `fetched_at, id`.
- `event_log.before/after` — часть контракта отката; менять формат можно только
  обратно совместимо.

## Формулы отображения

Одна формула на весь проект (`packages/core/src/calc/weapons.ts`):

```
displayedDmg = round(rawDamage, 1)
dps          = Math.round(displayedDmg * rof / 60)
ttk          = round((ceil(600 / displayedDmg) - 1) * 60 / rof, 2)
```

- `rawDamage` — урон на нужном уровне заточки; `rof` — выстрелов в минуту.
- Сначала округляется урон, затем из него считаются DPS и TTK.
- Сохранённые легаси-значения не используются для вывода. `npm run golden`
  доказывает, что расхождений с исходным досье нет.

## Правила предметов

- Облик — не предмет: `kind = motif`, база ищется по `name.key`
  (`item.motif.wpn.ks1_ssop` → token `ks1_ssop`) и пишется в `base_item_id`.
- Ранг берётся у самого оружия/брони, не у облика.
- «(А)» — отдельный предмет.
- Пулестойкость брони — из `numericVariants` вики, не из `bullet_dmg_factor`.
- Нет лота — `null` («нет лота»), нет статы — `null` («нет данных»). Ноль и
  пропуск не подменяют друг друга.

## Снапшоты и фолбэки

- Каждый успешный синк пишет новые строки/статы и обновляет `source.last_ok_at`.
- Ошибка синка не удаляет старые данные: статус `stale`, ошибка в `last_error`.
- Цены: 15-минутный TTL; при 5xx предыдущий `price_snapshot` продолжает
  отдаваться через `price_latest`, UI показывает его возраст.
- Импорт легаси идемпотентен: агрегация копий до upsert и абсолютный `qty`.
