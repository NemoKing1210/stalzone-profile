-- The card read selects every display column of item_stat for a list of item ids. A covering
-- index keeps that read index-only: the payload no longer has to touch the table row for
-- each stat, which dominated the cold build.
CREATE INDEX IF NOT EXISTS item_stat_read
  ON item_stat (
    item_id,
    level,
    stat_id,
    is_additional,
    value_num,
    value_min,
    value_max,
    value_text,
    pct,
    is_positive,
    label,
    source_id
  );
