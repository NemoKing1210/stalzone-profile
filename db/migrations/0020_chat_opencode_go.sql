-- OpenCode has two plans with different base URLs: Zen (pay-as-you-go) and Go. The
-- provider CHECK constraint cannot be altered in place, so rebuild the one-row table.
-- Stored `opencode` keeps its meaning (Zen); a Go user switches the provider in Settings.
CREATE TABLE chat_settings_new (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  provider             TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN
                         ('openai', 'anthropic', 'google', 'mistral', 'openrouter', 'ollama',
                          'opencode', 'opencode-go', 'command-code')),
  base_url             TEXT,
  api_key              TEXT,
  model                TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  temperature          REAL NOT NULL DEFAULT 0.2,
  max_tokens           INTEGER NOT NULL DEFAULT 2048,
  reasoning_effort     TEXT CHECK (reasoning_effort IN ('low', 'medium', 'high') OR reasoning_effort IS NULL),
  timeout_ms           INTEGER NOT NULL DEFAULT 30000,
  retries              INTEGER NOT NULL DEFAULT 1,
  read_tool_allow_list TEXT NOT NULL DEFAULT '[]',
  data_scope_prices    INTEGER NOT NULL DEFAULT 0 CHECK (data_scope_prices IN (0, 1)),
  data_scope_logs      INTEGER NOT NULL DEFAULT 0 CHECK (data_scope_logs IN (0, 1)),
  api_key_env          TEXT,
  updated_at           TEXT NOT NULL
) STRICT;

INSERT INTO chat_settings_new (
  id, provider, base_url, api_key, model, temperature, max_tokens, reasoning_effort,
  timeout_ms, retries, read_tool_allow_list, data_scope_prices, data_scope_logs,
  api_key_env, updated_at
)
SELECT
  id, provider, base_url, api_key, model, temperature, max_tokens, reasoning_effort,
  timeout_ms, retries, read_tool_allow_list, data_scope_prices, data_scope_logs,
  api_key_env, updated_at
FROM chat_settings;

DROP TABLE chat_settings;
ALTER TABLE chat_settings_new RENAME TO chat_settings;
