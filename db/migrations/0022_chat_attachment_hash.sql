-- Attachments are verified by their bytes; the hash makes the stored content identifiable and
-- gives the download route a strong ETag. Existing rows keep an empty hash and fall back to
-- an id+size tag until they are reattached.
ALTER TABLE chat_attachment ADD COLUMN sha256 TEXT NOT NULL DEFAULT '';
