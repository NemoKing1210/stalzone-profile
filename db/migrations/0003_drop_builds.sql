-- Saved builds are not part of the dossier: the project keeps only item-centred
-- entities (character, owned item, catalog, containers, prices, journal). Dropping
-- the child tables first keeps the foreign keys valid on the way out.
-- Historical event_log rows that mention builds stay in the journal, but their
-- snapshots can no longer be restored because the target tables are gone.
DROP TABLE build_slot;
DROP TABLE build_metric;
DROP TABLE build;
