-- Attachment ids must never be reused: a cached response is keyed by id, and a reused id
-- would serve the previous file to a new message. Rebuild the table with AUTOINCREMENT.
CREATE TABLE chat_attachment_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES chat_message(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  size       INTEGER NOT NULL CHECK (size >= 0),
  sha256     TEXT NOT NULL DEFAULT '',
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
INSERT INTO chat_attachment_new (id, message_id, name, mime_type, size, sha256, data, created_at)
  SELECT id, message_id, name, mime_type, size, sha256, data, created_at FROM chat_attachment;
DROP TABLE chat_attachment;
ALTER TABLE chat_attachment_new RENAME TO chat_attachment;
CREATE INDEX chat_attachment_message ON chat_attachment (message_id, id);
