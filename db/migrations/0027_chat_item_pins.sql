-- Assistant item pins and stored message references. Pins and refs are chat state, not
-- profile data: the chat module writes them and they are not event_log entries.
ALTER TABLE chat_message ADD COLUMN refs TEXT;

CREATE TABLE chat_pin (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  instance_id INTEGER REFERENCES inventory_item(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL,
  created_at  TEXT NOT NULL
) STRICT;

-- A catalog item can be pinned once; an owned instance can be pinned once. A catalog pin and
-- an instance pin of the same item are different targets and may coexist.
CREATE UNIQUE INDEX chat_pin_catalog ON chat_pin (item_id) WHERE instance_id IS NULL;
CREATE UNIQUE INDEX chat_pin_instance ON chat_pin (instance_id) WHERE instance_id IS NOT NULL;
