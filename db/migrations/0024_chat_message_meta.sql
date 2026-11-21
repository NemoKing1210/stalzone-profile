-- Assistant messages keep the provider's own facts: the reasoning text it returned, and the
-- model, round duration and token usage it reported. Both stay NULL when the provider did not
-- send them, so the UI can tell "no reasoning" from "empty reasoning".
ALTER TABLE chat_message ADD COLUMN reasoning TEXT;
ALTER TABLE chat_message ADD COLUMN meta TEXT;
