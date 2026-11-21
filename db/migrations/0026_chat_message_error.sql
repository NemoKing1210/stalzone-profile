-- A failed assistant turn leaves its user message in the transcript; the error explains why
-- it was not delivered and enables a retry. NULL means delivered (or still in flight).
ALTER TABLE chat_message ADD COLUMN error TEXT;
