-- 0009_event_context.sql — journal context for reading an entry without guessing.
-- Additive and nullable: rows written before this migration keep NULL context and stay
-- readable. `before`/`after` are untouched: they remain the rollback snapshot.
--
-- request_id  the HTTP `x-request-id` (also on `log_entry`), NULL for MCP/CLI and tests
-- origin      client/session origin: `http` (session cookie) or `api` (bearer token);
--             NULL when the writer had no request context
-- summary     structured JSON summary of the before/after pair, derived when the event is
--             written; a display aid only, never read by rollback

ALTER TABLE event_log ADD COLUMN request_id TEXT;
ALTER TABLE event_log ADD COLUMN origin TEXT;
ALTER TABLE event_log ADD COLUMN summary TEXT;

-- Journal tracing: open the log entries for the request that wrote an event.
CREATE INDEX event_log_request ON event_log (request_id);
