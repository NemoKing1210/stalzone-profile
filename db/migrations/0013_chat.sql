-- In-app assistant: settings, threads, messages and prompts. Keys are environment-only;
-- `api_key_env` stores the variable name, never its value.
CREATE TABLE chat_settings (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  provider            TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN
                        ('openai', 'anthropic', 'google', 'mistral', 'openrouter', 'ollama', 'opencode', 'command-code')),
  base_url            TEXT,
  model               TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  temperature         REAL NOT NULL DEFAULT 0.2,
  max_tokens          INTEGER NOT NULL DEFAULT 2048,
  reasoning_effort    TEXT CHECK (reasoning_effort IN ('low', 'medium', 'high') OR reasoning_effort IS NULL),
  timeout_ms          INTEGER NOT NULL DEFAULT 30000,
  retries             INTEGER NOT NULL DEFAULT 1,
  read_tool_allow_list TEXT NOT NULL DEFAULT '[]',
  data_scope_prices   INTEGER NOT NULL DEFAULT 0 CHECK (data_scope_prices IN (0, 1)),
  data_scope_logs     INTEGER NOT NULL DEFAULT 0 CHECK (data_scope_logs IN (0, 1)),
  api_key_env         TEXT,
  updated_at          TEXT NOT NULL
) STRICT;

INSERT INTO chat_settings (id, updated_at) VALUES (1, '2026-11-21T00:00:00.000Z');

CREATE TABLE chat_thread (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE chat_message (
  id           INTEGER PRIMARY KEY,
  thread_id    INTEGER NOT NULL REFERENCES chat_thread(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content      TEXT NOT NULL,
  tool_name    TEXT,
  tool_call_id TEXT,
  payload      TEXT,
  created_at   TEXT NOT NULL
) STRICT;
CREATE INDEX chat_message_thread ON chat_message (thread_id, id);

CREATE TABLE chat_prompt (
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('system', 'skill')),
  name       TEXT NOT NULL,
  body       TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  enabled    INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX chat_prompt_name ON chat_prompt (kind, name, version);

CREATE TABLE chat_prompt_active (
  kind       TEXT NOT NULL,
  name       TEXT NOT NULL,
  prompt_id  INTEGER NOT NULL REFERENCES chat_prompt(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, name)
) STRICT;
