-- 0003 — remove notes content blocks.
-- The Notes section and the 'notes' content kind are gone, so the rows have no consumer.
-- This cleanup is one-way; earlier content.put events stay in event_log for audit.

DELETE FROM content_block WHERE kind = 'notes';
