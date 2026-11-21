-- Owner decision 2026-11-21: the assistant token may be stored in the profile
-- (`api_key`), not only in the environment. The read API never returns it and the audit
-- journal never records it. `api_key_env` stays as an optional variable-name override and
-- is the fallback when no token is stored.
ALTER TABLE chat_settings ADD COLUMN api_key TEXT;

-- A value in api_key_env that is not an uppercase variable name was a pasted key; move it
-- to the new column instead of asking the owner to paste it again.
UPDATE chat_settings
SET api_key = api_key_env, api_key_env = NULL
WHERE api_key_env IS NOT NULL AND api_key_env NOT GLOB '[A-Z]*';
