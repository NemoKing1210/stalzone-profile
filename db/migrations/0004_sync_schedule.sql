-- One row of auto-sync intervals. 0 means off; non-zero is 15..10080 minutes.
CREATE TABLE sync_schedule (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  enabled           INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  catalog_every_min INTEGER NOT NULL DEFAULT 360,
  prices_every_min  INTEGER NOT NULL DEFAULT 60,
  profile_every_min INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL
) STRICT;

INSERT INTO sync_schedule (id, updated_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
