-- 0007_logging.sql — configurable diagnostic log.
-- Diagnostics are telemetry, not the audit journal: see docs/DATA-MODEL.md.

CREATE TABLE log_setting (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  min_level      TEXT NOT NULL DEFAULT 'info'
                 CHECK (min_level IN ('debug', 'info', 'warn', 'error')),
  retention_days INTEGER NOT NULL DEFAULT 14 CHECK (retention_days BETWEEN 1 AND 365),
  max_rows       INTEGER NOT NULL DEFAULT 200000 CHECK (max_rows BETWEEN 1000 AND 2000000),
  capture_client INTEGER NOT NULL DEFAULT 1 CHECK (capture_client IN (0, 1)),
  client_console INTEGER NOT NULL DEFAULT 0 CHECK (client_console IN (0, 1)),
  mirror_stdout  INTEGER NOT NULL DEFAULT 1 CHECK (mirror_stdout IN (0, 1)),
  updated_at     TEXT NOT NULL
) STRICT;

CREATE TABLE log_level (
  category   TEXT PRIMARY KEY,
  level      TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'off')),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE log_entry (
  id          INTEGER PRIMARY KEY,
  at          TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  category    TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('server', 'mcp', 'cli', 'client')),
  message     TEXT NOT NULL,
  context     TEXT,
  stack       TEXT,
  request_id  TEXT,
  fingerprint TEXT NOT NULL,
  duration_ms INTEGER
) STRICT;

CREATE INDEX log_entry_at ON log_entry (at DESC);
CREATE INDEX log_entry_level_at ON log_entry (level, at DESC);
CREATE INDEX log_entry_category_at ON log_entry (category, at DESC);
CREATE INDEX log_entry_fingerprint_at ON log_entry (fingerprint, at DESC);
CREATE INDEX log_entry_request ON log_entry (request_id);

INSERT INTO log_setting (id, updated_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
