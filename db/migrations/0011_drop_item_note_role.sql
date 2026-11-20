-- Inventory instances lose free-text role and note: both were scratch fields, never game data,
-- and the add/edit modals now expose only the typed per-kind matrix.
ALTER TABLE inventory_item DROP COLUMN note;
ALTER TABLE inventory_item DROP COLUMN role;
