-- Assistant attachments: files the owner explicitly attaches to one user message. Bytes live
-- in the profile DB beside the message and cascade with the thread; nothing is written to
-- disk and nothing enters event_log.
CREATE TABLE chat_attachment (
  id         INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES chat_message(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  size       INTEGER NOT NULL CHECK (size >= 0),
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX chat_attachment_message ON chat_attachment (message_id, id);
